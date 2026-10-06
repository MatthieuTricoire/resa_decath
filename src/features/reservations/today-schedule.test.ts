import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dateKeyToUtcNoon } from "#/lib/dates";
import { classifyScheduleRow } from "./today-schedule";

/** Un `Date` qui vaut ce jour-là à Paris, quelle que soit l'heure UTC. */
const paris = (key: string) => {
	const d = dateKeyToUtcNoon(key);
	if (!d) throw new Error(`date inconnue : ${key}`);
	return d;
};

const TODAY = "2026-10-06";
const yesterday = "2026-10-05";
const tomorrow = "2026-10-07";

describe("classifyScheduleRow — quatre tableaux, une règle par statut", () => {
	it("place un retrait d'aujourd'hui dans pickups", () => {
		expect(
			classifyScheduleRow("CONFIRMED", paris(TODAY), paris(tomorrow), TODAY),
		).toBe("pickups");
	});

	it("met un retrait non honoré dans latePickups", () => {
		// C'est le bug corrigé : avec l'ancien code, un retrait passé au statut
		// `CONFIRMED` disparaissait du tableau — il fallait `PENDING_VERIFICATION`,
		// un statut que personne n'écrit. Le matériel restait donc bloqué sans que
		// le comptoir le voie.
		expect(
			classifyScheduleRow("CONFIRMED", paris(yesterday), paris(TODAY), TODAY),
		).toBe("latePickups");
		expect(
			classifyScheduleRow(
				"CONFIRMED",
				paris("2026-10-03"),
				paris("2026-10-04"),
				TODAY,
			),
		).toBe("latePickups");
	});

	it("laisse un retrait futur hors du tableau du jour", () => {
		expect(
			classifyScheduleRow(
				"CONFIRMED",
				paris(tomorrow),
				paris("2026-10-08"),
				TODAY,
			),
		).toBeNull();
	});

	it("place un retour du jour dans returns, passé dans lateReturns", () => {
		expect(
			classifyScheduleRow("COLLECTED", paris(yesterday), paris(TODAY), TODAY),
		).toBe("returns");
		expect(
			classifyScheduleRow(
				"COLLECTED",
				paris(yesterday),
				paris(tomorrow),
				TODAY,
			),
		).toBe("returns");
		expect(
			classifyScheduleRow(
				"COLLECTED",
				paris(yesterday),
				paris(yesterday),
				TODAY,
			),
		).toBe("lateReturns");
	});

	it("compare les jours civils, pas l'heure stockée", () => {
		// 23 h UTC sont le lendemain matin à Paris en été. La même valeur brute
		// stockée en local (fuseau de la machine) ne doit pas changer de tableau.
		const pickupLateUtc = new Date("2026-10-06T23:00:00Z");
		expect(
			classifyScheduleRow("CONFIRMED", pickupLateUtc, paris(TODAY), TODAY),
		).toBeNull();
	});

	it("ne laisse rien sortir de RETURNED ni de CANCELLED", () => {
		for (const status of ["RETURNED", "CANCELLED"]) {
			expect(
				classifyScheduleRow(status, paris(yesterday), paris(yesterday), TODAY),
			).toBeNull();
			expect(
				classifyScheduleRow(status, paris(TODAY), paris(tomorrow), TODAY),
			).toBeNull();
		}
	});
});

// Le reste vérifie le contrat *source* : `queries.ts` ne peut pas être importé
// ici (il fabrique des server functions et ouvre la base), mais ce qu'il faut
// garantir est visible dans le texte : la machine de transition et l'usage du
// classifieur dans `getTodaySchedule`.
const QUERIES = readFileSync(
	fileURLToPath(new URL("./queries.ts", import.meta.url)),
	"utf8",
);

describe("statusTransitions — la machine d'état du back-office", () => {
	const transitions = QUERIES.slice(
		QUERIES.indexOf("const statusTransitions"),
		QUERIES.indexOf("};", QUERIES.indexOf("const statusTransitions")) + 2,
	);

	it("ne couvre que les quatre statuts vivants", () => {
		const keys = [...transitions.matchAll(/^\t([A-Z_]+): \[/gm)].map(
			(m) => m[1],
		);
		expect(keys.sort()).toEqual([
			"CANCELLED",
			"COLLECTED",
			"CONFIRMED",
			"RETURNED",
		]);
	});

	it("ne laisse pas CONFIRMED aller vers autre chose que retirer ou annuler", () => {
		expect(transitions).toMatch(/CONFIRMED: \["COLLECTED", "CANCELLED"\]/);
	});

	it("ne donne à COLLECTED que le retour, rien d'autre", () => {
		// Le clic « marquer comme retiré » ne peut pas être accompagné d'une
		// annulation : une fois le matériel sorti, seule sa reprise clôt la
		// location. C'était la garantie demandée par le comptoir.
		expect(transitions).toMatch(/COLLECTED: \["RETURNED"\]/);
	});

	it("ne laisse aucun statut terminal repartir", () => {
		expect(transitions).toMatch(/RETURNED: \[\],/);
		expect(transitions).toMatch(/CANCELLED: \[\],/);
	});

	it("occulte la validation d'email du statut : EXPIRED_TOKEN n'est pas un statut", () => {
		expect(transitions).not.toMatch(/EXPIRED|PENDING_VERIFICATION/);
	});
});

describe("getTodaySchedule — passe par le classifieur pur", () => {
	const getToday = QUERIES.slice(
		QUERIES.indexOf("export const getTodaySchedule"),
		QUERIES.indexOf(
			"export type",
			QUERIES.indexOf("export const getTodaySchedule"),
		),
	);

	it("classe en JavaScript, sans filtre de date dans la requête", () => {
		expect(getToday).toContain("classifyScheduleRow(");
		// La sélection se borne aux statuts ouverts : c'est le classifieur qui
		// décide, plus une liste de `WHERE` empilés où la date était re-dérivée.
		expect(getToday).toMatch(
			/inArray\(schema\.reservations\.status, \["CONFIRMED", "COLLECTED"\]\)/,
		);
		expect(getToday).not.toMatch(/DATE\(/);
	});

	it("n'écrit plus les statuts retirés", () => {
		expect(getToday).not.toMatch(/PENDING_VERIFICATION|"EXPIRED"/);
	});
});
