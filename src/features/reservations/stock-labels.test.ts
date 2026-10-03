import { describe, expect, it } from "vitest";
import {
	availabilityLabel,
	exemplairesLabel,
	minDurationLabel,
} from "./stock-labels";

describe("stock-labels", () => {
	it("singularise « exemplaire » à 0 et 1", () => {
		expect(exemplairesLabel(0)).toBe("0 exemplaire");
		expect(exemplairesLabel(1)).toBe("1 exemplaire");
		expect(exemplairesLabel(2)).toBe("2 exemplaires");
	});

	it("accorde « disponible » avec une fenêtre", () => {
		expect(availabilityLabel(1, true)).toBe(
			"1 exemplaire disponible pour ces dates",
		);
		expect(availabilityLabel(3, true)).toBe(
			"3 exemplaires disponibles pour ces dates",
		);
	});

	it("parle de stock sans fenêtre", () => {
		expect(availabilityLabel(4, false)).toBe("4 exemplaires en stock");
	});

	it("accorde la durée minimale", () => {
		expect(minDurationLabel(1)).toBe(
			"Durée minimale de 1 jour pour ce matériel.",
		);
		expect(minDurationLabel(3)).toBe(
			"Durée minimale de 3 jours pour ce matériel.",
		);
	});
});
