import { describe, expect, it } from "vitest";
import {
	evaluateItemAvailability,
	getActiveSeasonsForRange,
	getReservationDurationDays,
	getSeasonalAvailability,
	type RentalAvailabilitySettings,
} from "./availability";

const configuredSettings: RentalAvailabilitySettings = {
	seasonalFilteringEnabled: true,
	isRentalOpen: true,
	seasonOverride: "auto",
	summerFrom: "06-15",
	summerTo: "09-30",
	winterFrom: "12-15",
	winterTo: "02-28",
};

const at = (date: string) => new Date(`${date}T12:00:00.000Z`);

const item = {
	season: "summer" as const,
	availableFrom: null,
	availableTo: null,
	status: "AVAILABLE",
};

describe("getReservationDurationDays", () => {
	it("compte une journée pour un retrait et un retour le même jour", () => {
		expect(
			getReservationDurationDays(
				at("2026-07-10"),
				new Date("2026-07-10T12:00:00.001Z"),
			),
		).toBe(1);
	});
});

describe("evaluateItemAvailability", () => {
	it("laisse tous les produits disponibles lorsque le filtrage est désactivé", () => {
		const result = evaluateItemAvailability({
			item,
			settings: { ...configuredSettings, seasonalFilteringEnabled: false },
			pickupDate: at("2026-01-10"),
			returnDate: at("2026-01-12"),
		});

		expect(result.available).toBe(true);
	});

	it("ferme toutes les locations", () => {
		const result = evaluateItemAvailability({
			item,
			settings: { ...configuredSettings, isRentalOpen: false },
			pickupDate: at("2026-07-10"),
			returnDate: at("2026-07-12"),
		});

		expect(result).toEqual({
			available: false,
			reason: "rentals_closed",
		});
	});

	it("refuse une variante qui n’est pas disponible", () => {
		const result = evaluateItemAvailability({
			item: { ...item, status: "MAINTENANCE" },
			settings: configuredSettings,
			pickupDate: at("2026-07-10"),
			returnDate: at("2026-07-12"),
		});

		expect(result.reason).toBe("variant_unavailable");
	});

	it("accepte une plage entièrement contenue dans la saison", () => {
		const result = evaluateItemAvailability({
			item,
			settings: configuredSettings,
			pickupDate: at("2026-06-15"),
			returnDate: at("2026-09-30"),
		});

		expect(result.available).toBe(true);
	});

	it("refuse une plage qui sort de la saison", () => {
		const result = evaluateItemAvailability({
			item,
			settings: configuredSettings,
			pickupDate: at("2026-09-29"),
			returnDate: at("2026-10-02"),
		});

		expect(result.reason).toBe("outside_active_season");
	});

	it("gère une saison qui traverse décembre", () => {
		const result = evaluateItemAvailability({
			item: { ...item, season: "winter" },
			settings: configuredSettings,
			pickupDate: at("2025-12-20"),
			returnDate: at("2026-01-20"),
		});

		expect(result.available).toBe(true);
	});

	it("autorise all dans un trou mais refuse une saison précise", () => {
		const pickupDate = at("2026-03-01");
		const returnDate = at("2026-06-14");
		const allResult = evaluateItemAvailability({
			item: { ...item, season: "all" },
			settings: configuredSettings,
			pickupDate,
			returnDate,
		});
		const summerResult = evaluateItemAvailability({
			item,
			settings: configuredSettings,
			pickupDate,
			returnDate,
		});

		expect(allResult.available).toBe(true);
		expect(summerResult.reason).toBe("outside_active_season");
	});

	it("returns both seasons during an overlap", () => {
		const active = getActiveSeasonsForRange(
			at("2026-01-10"),
			at("2026-01-11"),
			{
				...configuredSettings,
				summerFrom: "12-15",
				summerTo: "02-15",
				winterFrom: "12-01",
				winterTo: "03-01",
			},
		);

		expect(active.wholeRangeAvailable).toBe(true);
		expect(active.seasons).toEqual(
			expect.arrayContaining(["summer", "winter"]),
		);
	});

	it("applique la période facultative du produit", () => {
		const result = evaluateItemAvailability({
			item: { ...item, availableFrom: "07-01", availableTo: "07-31" },
			settings: { ...configuredSettings, seasonalFilteringEnabled: false },
			pickupDate: at("2026-07-30"),
			returnDate: at("2026-08-02"),
		});

		expect(result.reason).toBe("outside_item_period");
	});

	it("refuse une durée inférieure au minimum du produit", () => {
		const result = evaluateItemAvailability({
			item: { ...item, minDuration: 2, minDurationUnit: "day" },
			settings: configuredSettings,
			pickupDate: at("2026-07-10"),
			returnDate: at("2026-07-10"),
		});

		expect(result.reason).toBe("below_minimum_duration");
	});

	it("respecte la surcharge saisonnière", () => {
		const result = evaluateItemAvailability({
			item,
			settings: {
				...configuredSettings,
				seasonOverride: "winter",
				summerFrom: null,
				summerTo: null,
			},
			pickupDate: at("2026-07-10"),
			returnDate: at("2026-07-12"),
		});

		expect(result.reason).toBe("outside_active_season");
	});

	it("ne filtre aucune saison en mode auto non configuré", () => {
		const pickupDate = at("2026-07-10");
		const returnDate = at("2026-07-12");
		const settings = {
			...configuredSettings,
			summerFrom: null,
			summerTo: null,
			winterFrom: null,
			winterTo: null,
		};
		const allResult = evaluateItemAvailability({
			item: { ...item, season: "all" as const },
			settings,
			pickupDate,
			returnDate,
		});
		const summerResult = evaluateItemAvailability({
			item,
			settings,
			pickupDate,
			returnDate,
		});

		expect(allResult.available).toBe(true);
		expect(summerResult.reason).toBe("season_not_configured");
	});
});

describe("getSeasonalAvailability", () => {
	it("refuse un produit hors de la saison forcée", () => {
		const settings = {
			...configuredSettings,
			seasonOverride: "summer" as const,
		};

		expect(
			getSeasonalAvailability({ season: "winter" }, settings, at("2026-07-10")),
		).toBe("out_of_season");
		expect(
			getSeasonalAvailability({ season: "summer" }, settings, at("2026-07-10")),
		).toBe("available");
	});

	it("indique quand le filtrage est désactivé", () => {
		expect(
			getSeasonalAvailability(
				{ season: "winter" },
				{ ...configuredSettings, seasonalFilteringEnabled: false },
				at("2026-07-10"),
			),
		).toBe("not_filtered");
	});

	it("signale une saison non configurée en mode automatique", () => {
		const settings = {
			...configuredSettings,
			summerFrom: null,
			summerTo: null,
			winterFrom: null,
			winterTo: null,
		};

		expect(
			getSeasonalAvailability({ season: "winter" }, settings, at("2026-07-10")),
		).toBe("not_configured");
		expect(
			getSeasonalAvailability({ season: "all" }, settings, at("2026-07-10")),
		).toBe("available");
	});
});
