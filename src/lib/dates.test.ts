import { describe, expect, it } from "vitest";
import {
	addDaysToDateKey,
	compareDateKeys,
	countRentalDays,
	dateKeyRangeFromDates,
	dateKeyRangeToDates,
	dateKeyToUtcNoon,
	earliestPickupDateInParis,
	formatLongDate,
	formatRentalWindow,
	isPastSameDayPickupCutoffInParis,
	isValidDateKey,
	rentalDurationLabel,
	todayInParis,
	toParisDateKey,
} from "./dates";

describe("dateKeyToUtcNoon", () => {
	it("convertit une clé en date à midi UTC", () => {
		const date = dateKeyToUtcNoon("2026-04-10");
		expect(date?.toISOString()).toBe("2026-04-10T12:00:00.000Z");
	});

	it("refuse une date inexistante", () => {
		expect(dateKeyToUtcNoon("2026-02-30")).toBeNull();
		expect(dateKeyToUtcNoon("2026-13-01")).toBeNull();
		expect(dateKeyToUtcNoon("10/04/2026")).toBeNull();
		expect(dateKeyToUtcNoon("")).toBeNull();
	});

	it("conserve la clé même au changement d'heure (été/hiver)", () => {
		for (const key of [
			"2026-01-15",
			"2026-07-15",
			"2026-03-29",
			"2026-10-25",
		]) {
			const date = dateKeyToUtcNoon(key);
			expect(date).not.toBeNull();
			expect(toParisDateKey(date as Date)).toBe(key);
		}
	});
});

describe("isValidDateKey", () => {
	it("valide les clés attendues", () => {
		expect(isValidDateKey("2026-04-10")).toBe(true);
		expect(isValidDateKey("2026-4-10")).toBe(false);
		expect(isValidDateKey("2026-02-29")).toBe(false);
		expect(isValidDateKey("2024-02-29")).toBe(true);
	});
});

describe("countRentalDays", () => {
	it("compte les bornes incluses", () => {
		expect(countRentalDays("2026-04-10", "2026-04-10")).toBe(1);
		expect(countRentalDays("2026-04-10", "2026-04-11")).toBe(2);
		expect(countRentalDays("2026-04-10", "2026-04-16")).toBe(7);
	});

	it("gère un mois de février", () => {
		expect(countRentalDays("2026-02-27", "2026-03-01")).toBe(3);
	});

	it("renvoie 0 si une date est invalide ou inversée", () => {
		expect(countRentalDays("2026-04-10", "2026-04-09")).toBe(0);
		expect(countRentalDays("2026-13-10", "2026-04-12")).toBe(0);
	});
});

describe("addDaysToDateKey", () => {
	it("ajoute des jours", () => {
		expect(addDaysToDateKey("2026-04-10", 3)).toBe("2026-04-13");
		expect(addDaysToDateKey("2026-04-10", 0)).toBe("2026-04-10");
		expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
	});

	it("renvoie null sur une clé invalide", () => {
		expect(addDaysToDateKey("nope", 1)).toBeNull();
	});
});

describe("compareDateKeys", () => {
	it("ordonne les clés", () => {
		expect(compareDateKeys("2026-04-10", "2026-04-11")).toBe(-1);
		expect(compareDateKeys("2026-04-11", "2026-04-10")).toBe(1);
		expect(compareDateKeys("2026-04-10", "2026-04-10")).toBe(0);
	});
});

describe("rentalDurationLabel", () => {
	it("accorde le pluriel", () => {
		expect(rentalDurationLabel(1)).toBe("1 jour");
		expect(rentalDurationLabel(2)).toBe("2 jours");
		expect(rentalDurationLabel(7)).toBe("7 jours");
	});
});

describe("formatLongDate", () => {
	it("formate en français", () => {
		expect(formatLongDate("2026-04-10")).toBe("Vendredi 10 avril 2026");
	});

	it("reste tolérant sur une valeur invalide", () => {
		expect(formatLongDate("nope")).toBe("nope");
	});
});

describe("todayInParis", () => {
	it("renvoie une clé valide", () => {
		expect(isValidDateKey(todayInParis())).toBe(true);
	});
});

describe("isPastSameDayPickupCutoffInParis", () => {
	it("précise l'heure du fuseau de Paris, pas celle de la machine", () => {
		// « en-GB », `hourCycle: "h23"` : 15h Paris est une borne, pas une heure
		// locale arbitraire.
		expect(
			isPastSameDayPickupCutoffInParis(new Date("2026-07-01T12:30:00Z")),
		).toBe(false);
	});

	it("est faux avant 15h à Paris", () => {
		// 14:30 en été (UTC+2), 14:59 en hiver (UTC+1).
		expect(
			isPastSameDayPickupCutoffInParis(new Date("2026-07-01T12:30:00Z")),
		).toBe(false);
		expect(
			isPastSameDayPickupCutoffInParis(new Date("2026-01-15T13:59:00Z")),
		).toBe(false);
	});

	it("est vrai à partir de 15h à Paris", () => {
		// 15:00 pile (été et hiver), puis tard le soir.
		expect(
			isPastSameDayPickupCutoffInParis(new Date("2026-07-01T13:00:00Z")),
		).toBe(true);
		expect(
			isPastSameDayPickupCutoffInParis(new Date("2026-01-15T14:00:00Z")),
		).toBe(true);
		expect(
			isPastSameDayPickupCutoffInParis(new Date("2026-07-01T19:00:00Z")),
		).toBe(true);
	});
});

describe("earliestPickupDateInParis", () => {
	it("renvoie aujourd'hui avant la coupure", () => {
		expect(earliestPickupDateInParis(new Date("2026-07-01T10:00:00Z"))).toBe(
			"2026-07-01",
		);
	});

	it("renvoie demain dès la coupure passée", () => {
		expect(earliestPickupDateInParis(new Date("2026-07-01T13:00:00Z"))).toBe(
			"2026-07-02",
		);
		expect(earliestPickupDateInParis(new Date("2026-01-15T23:30:00Z"))).toBe(
			"2026-01-16",
		);
	});

	it("repart du jour même juste après minuit", () => {
		expect(earliestPickupDateInParis(new Date("2026-07-02T00:00:00Z"))).toBe(
			"2026-07-02",
		);
	});
});

describe("formatRentalWindow", () => {
	it("n'écrit l'année qu'une fois sur une plage", () => {
		expect(formatRentalWindow("2026-04-12", "2026-04-15")).toBe(
			"12 → 15 avril 2026",
		);
	});

	it("répète le mois quand la plage change de mois", () => {
		expect(formatRentalWindow("2026-04-28", "2026-05-03")).toBe(
			"28 avril → 3 mai 2026",
		);
	});

	it("traite un retrait et un retour le même jour comme une journée", () => {
		expect(formatRentalWindow("2026-04-12", "2026-04-12")).toBe(
			"12 avril 2026",
		);
	});

	it("reste utilisable quand le retour n'est pas choisi", () => {
		expect(formatRentalWindow("2026-04-12", "")).toBe("12 avril 2026");
	});

	it("renvoie une chaîne vide sans date de retrait", () => {
		expect(formatRentalWindow("", "2026-04-15")).toBe("");
	});
});

describe("dateKeyRangeToDates", () => {
	it("convertit une fenêtre complète en dates à midi UTC", () => {
		const range = dateKeyRangeToDates("2026-04-12", "2026-04-15");
		expect(range?.from.toISOString()).toBe("2026-04-12T12:00:00.000Z");
		expect(range?.to?.toISOString()).toBe("2026-04-15T12:00:00.000Z");
	});

	it("tolère un retour absent", () => {
		const range = dateKeyRangeToDates("2026-04-12", "");
		expect(range?.from.toISOString()).toBe("2026-04-12T12:00:00.000Z");
		expect(range?.to).toBeUndefined();
	});

	it("renvoie undefined sans date de retrait", () => {
		expect(dateKeyRangeToDates("", "2026-04-15")).toBeUndefined();
	});
});

describe("dateKeyRangeFromDates", () => {
	it("fait l'aller-retour avec dateKeyRangeToDates", () => {
		const range = dateKeyRangeToDates("2026-04-12", "2026-04-15");
		const keys = dateKeyRangeFromDates(range ?? {});
		expect(keys).toEqual({ from: "2026-04-12", to: "2026-04-15" });
	});

	it("renvoie des clés vides pour une plage absente", () => {
		expect(dateKeyRangeFromDates({})).toEqual({ from: "", to: "" });
	});
});
