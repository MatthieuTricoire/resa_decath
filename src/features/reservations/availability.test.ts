import { describe, expect, it } from "vitest";
import {
	availableQuantity,
	cartLineBlocker,
	evaluateItemAvailability,
	evaluateSeasonWindow,
	getActiveSeasonsForRange,
	getReservationDurationDays,
	getSeasonalAvailability,
	isItemOutOfSeason,
	nextSeasonRestart,
	type RentalAvailabilitySettings,
	seasonRestartMessage,
	stockShortage,
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

	it("ferme tout le monde dans un trou, mixte compris", () => {
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

		expect(allResult.reason).toBe("outside_active_season");
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
			item: { ...item, minDuration: 2 },
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
		// Rien de configuré, rien de filtré : le refus serait arbitraire.
		expect(summerResult.available).toBe(true);
		expect(summerResult.reason).toBeNull();
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
		// Le badge décrit l'état du réglage, pas le produit : même les produits
		// mixte n'ont rien à quoi se fier tant qu'aucune période n'existe.
		expect(
			getSeasonalAvailability({ season: "all" }, settings, at("2026-07-10")),
		).toBe("not_configured");
	});
});

describe("isItemOutOfSeason", () => {
	it("masque un article de la saison opposée à la date donnée", () => {
		expect(
			isItemOutOfSeason(
				{ season: "summer" },
				configuredSettings,
				at("2026-01-10"),
			),
		).toBe(true);
		expect(
			isItemOutOfSeason(
				{ season: "winter" },
				configuredSettings,
				at("2026-07-10"),
			),
		).toBe(true);
	});

	it("garde un article de la saison active", () => {
		expect(
			isItemOutOfSeason(
				{ season: "summer" },
				configuredSettings,
				at("2026-07-10"),
			),
		).toBe(false);
		expect(
			isItemOutOfSeason(
				{ season: "winter" },
				configuredSettings,
				at("2026-01-10"),
			),
		).toBe(false);
	});

	it("ne masque pas un article mixte à l'intérieur d'une saison", () => {
		expect(
			isItemOutOfSeason(
				{ season: "all" },
				configuredSettings,
				at("2026-01-10"),
			),
		).toBe(false);
	});

	it("masque un article mixte en inter-saison", () => {
		// Entre l'hiver (fin 02-28) et l'été (début 06-15) : aucun jour n'est
		// couvert, donc personne n'est louable.
		expect(
			isItemOutOfSeason(
				{ season: "all" },
				configuredSettings,
				at("2026-04-15"),
			),
		).toBe(true);
		expect(
			isItemOutOfSeason(
				{ season: "all" },
				configuredSettings,
				at("2026-11-05"),
			),
		).toBe(true);
	});

	it("ne masque rien quand le filtrage est désactivé", () => {
		const settings = { ...configuredSettings, seasonalFilteringEnabled: false };
		expect(
			isItemOutOfSeason({ season: "summer" }, settings, at("2026-01-10")),
		).toBe(false);
	});

	it("ne masque rien tant qu'aucune plage saisonnière n'est configurée", () => {
		const settings = {
			...configuredSettings,
			summerFrom: null,
			summerTo: null,
			winterFrom: null,
			winterTo: null,
		};
		expect(
			isItemOutOfSeason({ season: "summer" }, settings, at("2026-01-10")),
		).toBe(false);
	});

	it("respecte la saison forcée", () => {
		const settings = {
			...configuredSettings,
			seasonOverride: "summer" as const,
		};
		expect(
			isItemOutOfSeason({ season: "winter" }, settings, at("2026-01-10")),
		).toBe(true);
		expect(
			isItemOutOfSeason({ season: "summer" }, settings, at("2026-01-10")),
		).toBe(false);
	});
});

describe("evaluateSeasonWindow", () => {
	it("n'interdit rien quand le filtrage est désactivé", () => {
		expect(
			evaluateSeasonWindow(
				{ season: "all" },
				at("2026-04-15"),
				at("2026-05-15"),
				{ ...configuredSettings, seasonalFilteringEnabled: false },
			),
		).toBeNull();
	});

	it("n'interdit rien quand aucune période n'est configurée", () => {
		const settings = {
			...configuredSettings,
			summerFrom: null,
			summerTo: null,
			winterFrom: null,
			winterTo: null,
		};
		expect(
			evaluateSeasonWindow(
				{ season: "summer" },
				at("2026-04-15"),
				at("2026-05-15"),
				settings,
			),
		).toBeNull();
	});

	it("accepte une fenêtre entièrement couverte, mixte ou non", () => {
		expect(
			evaluateSeasonWindow(
				{ season: "winter" },
				at("2026-01-05"),
				at("2026-01-12"),
				configuredSettings,
			),
		).toBeNull();
		expect(
			evaluateSeasonWindow(
				{ season: "all" },
				at("2026-01-05"),
				at("2026-01-12"),
				configuredSettings,
			),
		).toBeNull();
	});

	it("refuse une fenêtre qui traverse un trou, mixte compris", () => {
		expect(
			evaluateSeasonWindow(
				{ season: "all" },
				at("2026-09-29"),
				at("2026-10-05"),
				configuredSettings,
			),
		).toBe("outside_active_season");
		expect(
			evaluateSeasonWindow(
				{ season: "summer" },
				at("2026-09-29"),
				at("2026-10-05"),
				configuredSettings,
			),
		).toBe("outside_active_season");
	});

	it("laisse une saison forcée ne jamais créer de trou", () => {
		expect(
			evaluateSeasonWindow(
				{ season: "summer" },
				at("2026-04-15"),
				at("2026-05-15"),
				{ ...configuredSettings, seasonOverride: "summer" },
			),
		).toBeNull();
		// En revanche le produit, lui, reste hors saison.
		expect(
			evaluateSeasonWindow(
				{ season: "winter" },
				at("2026-04-15"),
				at("2026-05-15"),
				{ ...configuredSettings, seasonOverride: "summer" },
			),
		).toBe("outside_active_season");
	});
});

describe("nextSeasonRestart", () => {
	it("annonce la prochaine saison configurée", () => {
		const restart = nextSeasonRestart(configuredSettings, at("2026-04-15"));
		expect(restart?.season).toBe("summer");
		expect(restart?.date.toISOString().slice(0, 10)).toBe("2026-06-15");
	});

	it("annonce la saison d'après quand on est dans une saison déjà commencée", () => {
		const restart = nextSeasonRestart(configuredSettings, at("2026-10-01"));
		expect(restart?.season).toBe("winter");
		expect(restart?.date.toISOString().slice(0, 10)).toBe("2026-12-15");
	});

	it("ne dit rien hors mode automatique ou sans période", () => {
		expect(
			nextSeasonRestart(
				{ ...configuredSettings, seasonOverride: "summer" },
				at("2026-04-15"),
			),
		).toBeNull();
		expect(
			nextSeasonRestart(
				{
					...configuredSettings,
					summerFrom: null,
					summerTo: null,
					winterFrom: null,
					winterTo: null,
				},
				at("2026-04-15"),
			),
		).toBeNull();
	});

	it("date le message de reprise", () => {
		expect(seasonRestartMessage(configuredSettings, at("2026-04-15"))).toBe(
			"Les locations reprennent le 15 juin.",
		);
		expect(
			seasonRestartMessage(
				{ ...configuredSettings, seasonOverride: "winter" },
				at("2026-04-15"),
			),
		).toBeNull();
	});
});

describe("quantités disponibles", () => {
	it("déduit les réservations actives du stock total", () => {
		expect(availableQuantity(5, 0)).toBe(5);
		expect(availableQuantity(5, 3)).toBe(2);
	});

	it("borne à zéro, y compris en cas de surréservation", () => {
		expect(availableQuantity(5, 8)).toBe(0);
		expect(availableQuantity(0, 2)).toBe(0);
	});

	it("tolère les valeurs manquantes", () => {
		expect(availableQuantity(null, null)).toBe(0);
		expect(availableQuantity(undefined, undefined)).toBe(0);
	});

	it("repère une commande qui dépasse le stock restant", () => {
		expect(stockShortage(2, 5)).toBe(false);
		expect(stockShortage(5, 5)).toBe(false);
		expect(stockShortage(6, 5)).toBe(true);
		expect(stockShortage(1, 0)).toBe(true);
	});
});

describe("cartLineBlocker", () => {
	const line = {
		status: "available",
		message: null,
		quantity: 1,
		availableQuantity: 3,
	};

	it("laisse passer une ligne servable", () => {
		expect(cartLineBlocker(line)).toBeNull();
	});

	it("reprend le message du serveur quand le devis refuse", () => {
		expect(
			cartLineBlocker({
				...line,
				status: "unavailable",
				message: "Hors saison",
			}),
		).toBe("Hors saison");
		expect(cartLineBlocker({ ...line, status: "unavailable" })).toBe(
			"Ce matériel n’est pas louable pour ces dates.",
		);
	});

	it("signale un stock insuffisant en donnant le nombre restant", () => {
		expect(cartLineBlocker({ ...line, quantity: 5 })).toBe(
			"Stock insuffisant : 3 exemplaires disponibles pour ces dates.",
		);
		expect(
			cartLineBlocker({ ...line, quantity: 4, availableQuantity: 1 }),
		).toBe("Stock insuffisant : 1 exemplaire disponible pour ces dates.");
	});

	it("distingue l'épuisement complet", () => {
		expect(
			cartLineBlocker({ ...line, quantity: 1, availableQuantity: 0 }),
		).toBe("Tous les exemplaires sont réservés ou loués pour ces dates.");
	});
});
