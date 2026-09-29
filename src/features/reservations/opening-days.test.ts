import { describe, expect, it } from "vitest";
import {
	bookableDurations,
	closedEndpointMessage,
	closedEndpoints,
	closedReturnDurations,
	dayOfWeekFromDateKey,
	durationIsBookable,
	isOpenDay,
	resolveDuration,
	returnDateForDuration,
} from "./opening-days";

/**
 * Rappel des dates utilisées : le 12 avril 2026 est un dimanche, le 11 un
 * samedi, le 13 un lundi. Toute la règle tient sur ces trois jours : le magasin
 * ouvre du lundi au samedi, et le dimanche seulement s'il a été ouvert.
 */
const SAMEDI = "2026-04-11";
const DIMANCHE = "2026-04-12";
const LUNDI = "2026-04-13";
const VENDREDI = "2026-04-10";
const MERCREDI = "2026-04-15";

const FERME = { sundayOpen: false };
const OUVERT = { sundayOpen: true };

describe("dayOfWeekFromDateKey", () => {
	it("nomme le jour de la semaine, 0 = dimanche", () => {
		expect(dayOfWeekFromDateKey(DIMANCHE)).toBe(0);
		expect(dayOfWeekFromDateKey(SAMEDI)).toBe(6);
		expect(dayOfWeekFromDateKey(LUNDI)).toBe(1);
		expect(dayOfWeekFromDateKey(MERCREDI)).toBe(3);
	});

	it("refuse une date inexistante plutôt que de la décaler", () => {
		expect(dayOfWeekFromDateKey("2026-02-30")).toBeNull();
		expect(dayOfWeekFromDateKey("pas-une-date")).toBeNull();
	});
});

describe("isOpenDay", () => {
	it("ferme le dimanche par défaut", () => {
		expect(isOpenDay(DIMANCHE, FERME)).toBe(false);
	});

	it("ouvre tous les autres jours, même sans réglage", () => {
		for (const day of [VENDREDI, SAMEDI, LUNDI, MERCREDI]) {
			expect(isOpenDay(day, FERME)).toBe(true);
		}
	});

	it("ouvre le dimanche quand l'admin l'a autorisé", () => {
		expect(isOpenDay(DIMANCHE, OUVERT)).toBe(true);
		expect(isOpenDay(LUNDI, OUVERT)).toBe(true);
	});

	it("traite une date invalide comme fermée", () => {
		expect(isOpenDay("2026-02-30", OUVERT)).toBe(false);
	});
});

describe("returnDateForDuration", () => {
	it("compte les bornes incluses", () => {
		expect(returnDateForDuration(SAMEDI, 1)).toBe(SAMEDI);
		expect(returnDateForDuration(SAMEDI, 2)).toBe(DIMANCHE);
		expect(returnDateForDuration(SAMEDI, 3)).toBe(LUNDI);
	});

	it("refuse une durée nulle", () => {
		expect(returnDateForDuration(SAMEDI, 0)).toBeNull();
	});
});

describe("durationIsBookable", () => {
	it("refuse une durée dont le retour est un dimanche fermé", () => {
		expect(
			durationIsBookable({
				pickupDate: SAMEDI,
				durationDays: 2,
				settings: FERME,
			}),
		).toBe(false);
	});

	it("accepte la même durée quand le dimanche est ouvert", () => {
		expect(
			durationIsBookable({
				pickupDate: SAMEDI,
				durationDays: 2,
				settings: OUVERT,
			}),
		).toBe(true);
	});

	/**
	 * Le cas d'usage à ne pas casser : la location du week-end traverse un
	 * dimanche fermé. Seules les bornes comptent, le matériel reste chez le client
	 * pendant que le comptoir est fermé.
	 */
	it("accepte une location qui couvre un dimanche fermé au milieu", () => {
		expect(
			durationIsBookable({
				pickupDate: SAMEDI,
				durationDays: 3,
				settings: FERME,
			}),
		).toBe(true);
	});

	it("refuse un retrait un dimanche fermé", () => {
		expect(
			durationIsBookable({
				pickupDate: DIMANCHE,
				durationDays: 1,
				settings: FERME,
			}),
		).toBe(false);
		expect(
			durationIsBookable({
				pickupDate: DIMANCHE,
				durationDays: 1,
				settings: OUVERT,
			}),
		).toBe(true);
	});
});

describe("bookableDurations", () => {
	it("écarte les durées qui se terminent un dimanche fermé", () => {
		expect(
			bookableDurations({
				pickupDate: SAMEDI,
				durations: [1, 2, 3, 7],
				settings: FERME,
			}),
		).toEqual([1, 3, 7]);
	});

	it("ne retire rien quand le dimanche est ouvert", () => {
		expect(
			bookableDurations({
				pickupDate: SAMEDI,
				durations: [1, 2, 3, 7],
				settings: OUVERT,
			}),
		).toEqual([1, 2, 3, 7]);
	});

	it("ne rend aucune durée depuis un dimanche fermé", () => {
		expect(
			bookableDurations({
				pickupDate: DIMANCHE,
				durations: [1, 2, 3],
				settings: FERME,
			}),
		).toEqual([]);
	});
});

describe("resolveDuration", () => {
	it("conserve la durée demandée si son retour est possible", () => {
		expect(
			resolveDuration({
				pickupDate: SAMEDI,
				requestedDuration: 3,
				durations: [1, 2, 3, 7],
				settings: FERME,
			}),
		).toBe(3);
	});

	it("prolonge plutôt que de raccourcir", () => {
		expect(
			resolveDuration({
				pickupDate: SAMEDI,
				requestedDuration: 2,
				durations: [1, 2, 3],
				settings: FERME,
			}),
		).toBe(3);
	});

	it("retombe sur la plus longue durée si aucune ne dépasse", () => {
		expect(
			resolveDuration({
				pickupDate: SAMEDI,
				requestedDuration: 7,
				durations: [1, 2, 3],
				settings: FERME,
			}),
		).toBe(3);
	});

	it("renvoie null quand aucune durée ne peut être rendue", () => {
		expect(
			resolveDuration({
				pickupDate: DIMANCHE,
				requestedDuration: 2,
				durations: [1, 2, 3],
				settings: FERME,
			}),
		).toBeNull();
	});

	it("ne change rien quand le dimanche est ouvert", () => {
		expect(
			resolveDuration({
				pickupDate: SAMEDI,
				requestedDuration: 2,
				durations: [1, 2, 3],
				settings: OUVERT,
			}),
		).toBe(2);
	});
});

describe("closedEndpoints", () => {
	it("ne signale rien sur une fenêtre valide, même avec un dimanche au milieu", () => {
		expect(
			closedEndpoints({
				pickupDate: SAMEDI,
				returnDate: LUNDI,
				settings: FERME,
			}),
		).toEqual([]);
	});

	it("signale un retour fermé", () => {
		expect(
			closedEndpoints({
				pickupDate: SAMEDI,
				returnDate: DIMANCHE,
				settings: FERME,
			}),
		).toEqual([{ role: "return", dateKey: DIMANCHE }]);
	});

	it("signale un retrait fermé, et les deux bornes si besoin", () => {
		expect(
			closedEndpoints({
				pickupDate: DIMANCHE,
				returnDate: DIMANCHE,
				settings: FERME,
			}),
		).toEqual([
			{ role: "pickup", dateKey: DIMANCHE },
			{ role: "return", dateKey: DIMANCHE },
		]);
	});

	it("ne signale rien un dimanche ouvert", () => {
		expect(
			closedEndpoints({
				pickupDate: DIMANCHE,
				returnDate: LUNDI,
				settings: OUVERT,
			}),
		).toEqual([]);
	});
});

describe("closedEndpointMessage", () => {
	it("oriente vers la date de retrait", () => {
		const message = closedEndpointMessage({
			role: "pickup",
			dateKey: DIMANCHE,
		});
		expect(message).toContain("dimanche 12 avril 2026");
		expect(message).toContain("date de retrait");
	});

	it("oriente vers la durée quand c'est le retour qui bloque", () => {
		const message = closedEndpointMessage({
			role: "return",
			dateKey: DIMANCHE,
		});
		expect(message).toContain("dimanche 12 avril 2026");
		expect(message).toContain("autre durée");
	});
});

describe("closedReturnDurations", () => {
	it("ne bloque rien quand le dimanche est ouvert", () => {
		const blocked = closedReturnDurations({
			pickupDate: SAMEDI,
			durations: [1, 2],
			settings: OUVERT,
		});
		expect(blocked).toEqual([]);
	});

	it("donne la durée et la raison, en français, pour chaque retour fermé", () => {
		const blocked = closedReturnDurations({
			pickupDate: SAMEDI,
			durations: [1, 2, 3, 7],
			settings: FERME,
		});
		// Samedi + 1 = samedi, + 2 = dimanche (bloqué), + 3 = lundi, + 7 = samedi.
		expect(blocked.map((block) => block.duration)).toEqual([2]);
		expect(blocked[0]?.reason).toContain("dimanche 12 avril 2026");
		expect(blocked[0]?.reason).toContain("magasin fermé");
	});

	it("ignore les jours intérieurs : un retour au lundi reste possible", () => {
		const blocked = closedReturnDurations({
			pickupDate: SAMEDI,
			durations: [3],
			settings: FERME,
		});
		expect(blocked).toEqual([]);
	});

	it("reste muet sur une durée nulle, qui n'a pas de retour", () => {
		const blocked = closedReturnDurations({
			pickupDate: SAMEDI,
			durations: [0],
			settings: FERME,
		});
		expect(blocked).toEqual([]);
	});
});
