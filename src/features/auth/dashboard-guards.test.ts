/**
 * Un endpoint d'administration ne doit rien faire tant que l'appelant n'est pas
 * habilité.
 *
 * Le risque est réel : `/admin/_layout` appelle `getDashboardSession()` dans son
 * `loader`, ce qui protège l'écran. Mais une server function est un POST HTTP
 * distinct, joignable sans passer par cette route. Sans garde dans le handler,
 * l'interface est la seule barrière — donc aucune.
 *
 * Ce fichier vérifie deux choses, volontairement séparées :
 *
 * 1. le contrat des gardes (`requireDashboardSession`, `requireAdminSession`) ;
 * 2. que chaque handler d'administration appelle une garde, et avant tout accès
 *    à la base.
 *
 * Le second point est un contrôle de source, pas d'exécution. Ce n'est pas un
 * compromis par défaut : la server function n'expose que `__executeServer`, qui
 * exige toute la chaîne de requête de TanStack pour s'exécuter. On ne peut donc
 * pas appeler un handler depuis un test unitaire sans reconstruire le runtime
 * HTTP. Lire la source vérifie ce qui compte réellement — que le garde est
 * présent, et qu'il vient en premier — là où un test d'exécution ne ferait que
 * le vérifier pour un seul chemin d'appel.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
	current: null as { user: unknown } | null,
}));

vi.mock("#/features/auth/session.server", () => ({
	getSession: async () => session.current,
}));

const REFUS = "Accès refusé";

describe("Garde.requireDashboardSession", () => {
	it("refuse sans session", async () => {
		const { requireDashboardSession } = await import("#/features/auth/queries");
		session.current = null;
		await expect(requireDashboardSession()).rejects.toThrow(REFUS);
	});

	it("refuse un client connecté", async () => {
		// Le cas le plus réaliste : la session est valide, le rôle ne l'est pas.
		const { requireDashboardSession } = await import("#/features/auth/queries");
		session.current = { user: { id: "u1", role: "user" } };
		await expect(requireDashboardSession()).rejects.toThrow(REFUS);
	});

	it("laisse passer un gérant et un administrateur", async () => {
		const { requireDashboardSession } = await import("#/features/auth/queries");
		for (const role of ["manager", "admin"]) {
			session.current = { user: { id: "m1", role } };
			await expect(requireDashboardSession()).resolves.toBeDefined();
		}
	});
});

describe("Garde.requireAdminSession", () => {
	it("refuse un gérant, admet un administrateur", async () => {
		// Règle du comptoir : le gérant lit la facturation, seul l'admin l'écrit.
		const { requireAdminSession } = await import("#/features/auth/queries");
		session.current = { user: { id: "m1", role: "manager" } };
		await expect(requireAdminSession()).rejects.toThrow(REFUS);
		session.current = { user: { id: "a1", role: "admin" } };
		await expect(requireAdminSession()).resolves.toBeDefined();
	});
});

/**
 * Handlers d'administration, et la garde que chacun doit appeler.
 *
 * `billing/queries.ts` est à part : c'est le seul module où le rôle diffère
 * entre lecture et écriture, il a ses propres assertions plus bas.
 */
const GUARDED = [
	{
		file: "features/users/queries.ts",
		names: [
			"getUsers",
			"createUser",
			"getUserDetail",
			"getUserReservations",
			"updateUser",
		],
	},
	{
		file: "features/equipements/queries.ts",
		names: [
			"getCategories",
			"getVariants",
			"getItem",
			"getItemVariants",
			"createItem",
			"updateItem",
			"retireItem",
			"reactivateItem",
		],
	},
	{
		file: "features/reservations/queries.ts",
		names: [
			"getReservations",
			"getReservation",
			"updateReservationStatus",
			"getDashboardKPIs",
			"getTodaySchedule",
		],
	},
	{ file: "features/stats/queries.ts", names: ["getStatsData"] },
] as const;

const GUARD_CALL = /await (require\w+Session)\(\)/;

function readSource(relative: string): string {
	// Ce fichier est dans `features/auth/` : deux niveaux pour revenir à `src/`.
	return readFileSync(
		fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
		"utf8",
	);
}

/** Le corps d'un `export const nom`, jusqu'au `export const` suivant. */
function handlerBody(source: string, name: string): string {
	const start = source.indexOf(`export const ${name} `);
	if (start === -1) throw new Error(`${name} introuvable`);
	const rest = source.slice(start + 1);
	const next = rest.indexOf("\nexport const ");
	return next === -1 ? rest : rest.slice(0, next);
}

describe("Endpoints d'administration — le garde précède la base", () => {
	for (const { file, names } of GUARDED) {
		const source = readSource(file);

		for (const name of names) {
			it(`${name} appelle une garde avant d'accéder à la base`, () => {
				const body = handlerBody(source, name);

				// `expect().not.toBeNull()` ne rétrécit pas le type : sans ce `if`,
				// la ligne suivante lirait un `null` possible. L'échec explicite
				// garde le message, qui dit ce que représente la régression.
				const guard = body.match(GUARD_CALL);
				if (!guard) {
					throw new Error(
						`${name} n'appelle aucune garde : l'endpoint est joignable sans session`,
					);
				}

				// L'ordre compte autant que la présence : un garde placé après la
				// première requête laisse fuiter la donnée qu'il devait protéger.
				const guardAt = guard.index ?? 0;
				for (const call of body.matchAll(/await db\b/g)) {
					expect(
						call.index ?? 0,
						`${name} touche la base avant le garde`,
					).toBeGreaterThan(guardAt);
				}
			});
		}
	}
});

describe("Facturation — seul l'admin écrit", () => {
	it("updateBillingSettings exige le rôle administrateur", () => {
		// La lecture reste accessible au gérant : c'est l'écriture qui est
		// réservée. Vérifié à la fois ici et par le contrat du garde plus haut.
		const source = readSource("features/billing/queries.ts");
		const body = handlerBody(source, "updateBillingSettings");
		expect(body).toMatch(GUARD_CALL);
		expect(body).toContain("requireAdminSession");
	});

	it("la lecture des réglages reste ouverte au gérant", () => {
		const source = readSource("features/billing/queries.ts");
		expect(handlerBody(source, "getBillingSettings")).toContain(
			"requireDashboardSession",
		);
	});
});
