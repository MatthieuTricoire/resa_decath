/**
 * L'annulation d'une réservation par le client connecté.
 *
 * Ce module ne teste pas le rendu du bouton : il teste la seule chose qui protège
 * l'historique des autres clients, à savoir que la propriété est vérifiée dans la
 * requête. Un `id` de réservation deviné ne doit rien déclencher.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
	fileURLToPath(new URL("./my-queries.server.ts", import.meta.url)),
	"utf8",
);

function bodyOf(name: string): string {
	const start = SOURCE.indexOf(`const ${name} = createServerOnlyFn`);
	if (start === -1) throw new Error(`${name} introuvable`);
	const rest = SOURCE.slice(start);
	const next = rest.indexOf("\n/**");
	return next === -1 ? rest : rest.slice(0, next);
}

const cancel = bodyOf("cancelMyReservation");

describe("cancelMyReservation — la propriété est dans la requête", () => {
	it("filtre sur la session ET sur le statut, dans le même WHERE", () => {
		// La session est lue par `requireUser`, qui lève sans elle : c'est la
		// preuve de propriété. Le statut filtré dans le même `UPDATE` est ce qui
		// rend l'annulation atomique — deux onglets ne peuvent pas la faire passer
		// avant que l'autre n'écrive.
		expect(cancel).toContain("requireUser()");
		expect(cancel).toContain("eq(schema.reservations.userId, userId)");
		expect(cancel).toContain("CLIENT_CANCELLABLE_STATUSES");
	});

	it("ne distingue pas « pas à vous » de « pas existante »", () => {
		// Une réserve inexistante et une réservation d'autrui doivent se comporter
		// identiquement, sinon le retour confirme l'existence d'une réservation
		// qui ne concerne pas l'appelant.
		expect(cancel).toContain("cancelled ?? null");
		expect(cancel).not.toMatch(/throw new Error/);
	});

	it("ne libère pas le stock à la main", () => {
		// `STOCK_CONSUMING_STATUSES` exclut `CANCELLED` : la disponibilité se
		// recalcule à la lecture. Un decrement ici serait un second chemin de vérité.
		expect(cancel).not.toMatch(/updateStock|reservedQuantity|decrement/i);
	});

	it("ne laisse annuler qu'avant le retrait, et seulement CONFIRMED", () => {
		// Plus de `PENDING_VERIFICATION` à gérer : toute réservation est confirmée
		// d'entrée. Dès le matériel sorti (`COLLECTED`), l'annulation n'existe
		// plus — il ne reste que le retour.
		expect(SOURCE).toMatch(/CLIENT_CANCELLABLE_STATUSES\s*=\s*\["CONFIRMED"\]/);
	});
});

describe("notifyReservationCancellation — ne lève jamais", () => {
	it("attrape ses erreurs et n'envoie que si la réservation est lue", () => {
		const notify = bodyOf("notifyReservationCancellation");
		expect(notify).toContain("catch");
		expect(notify).toContain("eq(schema.reservations.userId, userId)");
		expect(notify).toContain("sendReservationCancellationEmail");
	});
});
