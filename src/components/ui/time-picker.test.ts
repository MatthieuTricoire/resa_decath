import { describe, expect, it } from "vitest";
import { normalizeTimeInput } from "./time-picker";

describe("normalizeTimeInput", () => {
	it("complète une heure et des minutes saisies d'un bloc", () => {
		expect(normalizeTimeInput("0930")).toBe("09:30");
		expect(normalizeTimeInput("0800")).toBe("08:00");
	});

	it("tolère les séparateurs et les espaces", () => {
		expect(normalizeTimeInput("09:30")).toBe("09:30");
		expect(normalizeTimeInput(" 09 h 30 ")).toBe("09:30");
		expect(normalizeTimeInput("09h30")).toBe("09:30");
	});

	it("interprète un chiffre isolé comme une heure en cours de frappe", () => {
		// « 9 » puis « 30 » doit aboutir à 9:30, pas à 09:03 ou 00:09.
		expect(normalizeTimeInput("9")).toBe("09:00");
		expect(normalizeTimeInput(`${"9"}30`)).toBe("09:30");
	});

	it("garde les quarts d'heure, y compris ceux hors grille", () => {
		// Le dimanche du magasin ouvre à 8h45 : la saisie clavier doit l'atteindre.
		expect(normalizeTimeInput("0845")).toBe("08:45");
		expect(normalizeTimeInput("1300")).toBe("13:00");
	});

	it("accepte 24:00 comme minuit plutôt que de le refuser", () => {
		// Beaucoup saisissent 2400 pour minuit ; le refuser les forcerait à corriger.
		expect(normalizeTimeInput("2400")).toBe("00:00");
	});

	it("refuse ce qui n'est pas une heure", () => {
		expect(normalizeTimeInput("")).toBe("");
		expect(normalizeTimeInput("abc")).toBe("");
		expect(normalizeTimeInput("2560")).toBe("");
		expect(normalizeTimeInput("0960")).toBe("");
	});

	it("ne fabrique pas d'heure à partir d'une saisie effacée", () => {
		// Une borne vide doit rester vide : 00:00 serait un retrait à minuit.
		expect(normalizeTimeInput("  ")).toBe("");
	});
});
