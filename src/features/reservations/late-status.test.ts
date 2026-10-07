import { describe, expect, it } from "vitest";
import { dateKeyToUtcNoon } from "#/lib/dates";
import {
	isLatePickup,
	isLateReturn,
	isOverdue,
	type LateInput,
	overdueDays,
	overdueLabel,
} from "./late-status";

/** Un `Date` qui vaut ce jour-là à Paris, quelle que soit l'heure UTC. */
const paris = (key: string) => {
	const d = dateKeyToUtcNoon(key);
	if (!d) throw new Error(`date inconnue : ${key}`);
	return d;
};

/** La date stockée à midi UTC, comme le font les saisies du site. */
const iso = (key: string) => paris(key).toISOString();

const TODAY = "2026-10-06";
const yesterday = "2026-10-05";
const tomorrow = "2026-10-07";

const resa = (status: string, pickup: string, ret: string): LateInput => ({
	status,
	pickupDate: iso(pickup),
	returnDate: iso(ret),
});

describe("late-status — la fiche parle comme le tableau des réservations", () => {
	it("signale un retrait dépassé comme retrait en retard", () => {
		const r = resa("CONFIRMED", yesterday, TODAY);
		expect(isLatePickup(r, TODAY)).toBe(true);
		expect(isLateReturn(r, TODAY)).toBe(false);
		expect(isOverdue(r, TODAY)).toBe(true);
		expect(overdueLabel(r, TODAY)).toBe("Retrait en retard");
	});

	it("compte les jours au-delà du premier jour de retard", () => {
		const r = resa("CONFIRMED", "2026-10-03", TODAY);
		expect(overdueDays(r, TODAY)).toBe(3);
		expect(overdueLabel(r, TODAY)).toBe("Retrait en retard · 3 j");
	});

	it("signale un retour en retard", () => {
		const r = resa("COLLECTED", yesterday, yesterday);
		expect(isLateReturn(r, TODAY)).toBe(true);
		expect(isLatePickup(r, TODAY)).toBe(false);
		expect(isOverdue(r, TODAY)).toBe(true);
		expect(overdueLabel(r, TODAY)).toBe("Retour en retard");
	});

	it("ne signale rien pour un retrait du jour ou futur", () => {
		expect(isOverdue(resa("CONFIRMED", TODAY, tomorrow), TODAY)).toBe(false);
		expect(isOverdue(resa("CONFIRMED", tomorrow, "2026-10-08"), TODAY)).toBe(
			false,
		);
	});

	it("ne signale rien pour un retour du jour ou futur", () => {
		expect(isOverdue(resa("COLLECTED", yesterday, TODAY), TODAY)).toBe(false);
		expect(isOverdue(resa("COLLECTED", yesterday, tomorrow), TODAY)).toBe(
			false,
		);
	});

	it("ne fait rien sortir de RETURNED ni de CANCELLED", () => {
		// Un no-show est une réservation CANCELLED : la fiche affiche son propre
		// badge « Non présenté », pas un retard à gérer au comptoir.
		for (const status of ["RETURNED", "CANCELLED"]) {
			expect(isOverdue(resa(status, yesterday, yesterday), TODAY)).toBe(false);
			expect(isOverdue(resa(status, TODAY, tomorrow), TODAY)).toBe(false);
		}
	});
});
