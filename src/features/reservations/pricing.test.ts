import { describe, expect, it } from "vitest";
import {
	parsePrice,
	priceForDuration,
	productDurationSupport,
	quoteVariantForDuration,
	supportsDuration,
	unpricedDurations,
} from "./pricing";

const options = [
	{ id: "opt-1", duration: 1, label: "1 jour", price: "12.00" },
	{ id: "opt-3", duration: 3, label: "3 jours", price: "30.00" },
];

describe("quoteVariantForDuration — variantes tarifées par durée", () => {
	it("résout la fenêtre par durée quand aucune option n'est imposée", () => {
		const quote = quoteVariantForDuration({
			priceOptions: options,
			durationDays: 3,
		});
		expect(quote).toEqual({
			status: "priced",
			priceOptionId: "opt-3",
			unitPrice: 30,
			label: "3 jours",
		});
	});

	it("accepte l'option choisie si elle correspond à la durée", () => {
		const quote = quoteVariantForDuration({
			priceOptions: options,
			durationDays: 3,
			priceOptionId: "opt-3",
		});
		expect(quote.status).toBe("priced");
	});

	it("refuse une option d'une autre durée", () => {
		const quote = quoteVariantForDuration({
			priceOptions: options,
			durationDays: 2,
			priceOptionId: "opt-3",
		});
		expect(quote).toEqual({
			status: "unpriced",
			reason: "duration_not_priced",
		});
	});

	it("refuse une option inconnue ou désactivée", () => {
		const quote = quoteVariantForDuration({
			priceOptions: options,
			durationDays: 1,
			priceOptionId: "opt-obsolete",
		});
		expect(quote).toEqual({
			status: "unpriced",
			reason: "unknown_price_option",
		});
	});

	it("signale une durée non tarifée plutôt qu'un prix approché", () => {
		const quote = quoteVariantForDuration({
			priceOptions: options,
			durationDays: 7,
		});
		expect(quote).toEqual({
			status: "unpriced",
			reason: "duration_not_priced",
		});
	});

	it("ne tarife pas une variante sans aucune option active", () => {
		const quote = quoteVariantForDuration({
			priceOptions: [],
			durationDays: 1,
		});
		expect(quote).toEqual({
			status: "unpriced",
			reason: "duration_not_priced",
		});
	});
});

describe("quoteVariantForDuration — durée", () => {
	it("refuse une durée nulle, négative ou fractionnaire", () => {
		for (const durationDays of [0, -2, 1.5, Number.NaN]) {
			const quote = quoteVariantForDuration({
				priceOptions: options,
				durationDays,
			});
			expect(quote).toEqual({
				status: "unpriced",
				reason: "invalid_duration",
			});
		}
	});
});

describe("productDurationSupport", () => {
	it("liste les durées tarifables et leur prix", () => {
		const support = productDurationSupport({ priceOptions: options });
		expect(support.durations).toEqual([1, 3]);
		expect(support.priceByDuration).toEqual({ 1: 12, 3: 30 });
	});

	it("ne vend rien sans option de prix", () => {
		const support = productDurationSupport({ priceOptions: [] });
		expect(support.durations).toEqual([]);
		expect(support.priceByDuration).toEqual({});
	});

	it("écarte une option dont le prix est illisible", () => {
		for (const price of ["", "sur devis", "12,00"]) {
			const support = productDurationSupport({
				priceOptions: [{ id: "opt-1", duration: 1, label: "1 jour", price }],
			});
			expect(support.durations).toEqual([]);
		}
	});

	it("écarte les options antérieures à la durée minimale de l'article", () => {
		const support = productDurationSupport({
			priceOptions: options,
			minDuration: 2,
		});
		expect(support.durations).toEqual([3]);
		expect(support.priceByDuration[1]).toBeUndefined();
	});

	it("une durée minimale de 1 jour laisse passer toutes les options", () => {
		const support = productDurationSupport({
			priceOptions: options,
			minDuration: 1,
		});
		expect(support.durations).toEqual([1, 3]);
	});

	it("prend le prix le plus bas quand deux options couvrent la durée", () => {
		const support = productDurationSupport({
			priceOptions: [
				...options,
				{ id: "opt-1-bis", duration: 1, label: "1 jour", price: "9.50" },
			],
		});
		expect(support.priceByDuration[1]).toBe(9.5);
	});

	it("fusionne les options de plusieurs variantes du même article", () => {
		const support = productDurationSupport({
			priceOptions: [
				{ id: "opt-m", duration: 3, label: "3 jours", price: "30.00" },
				{ id: "opt-l", duration: 3, label: "3 jours", price: "28.00" },
				{ id: "opt-l-7", duration: 7, label: "7 jours", price: "55.00" },
			],
		});
		expect(support.durations).toEqual([3, 7]);
		expect(support.priceByDuration[3]).toBe(28);
	});
});

describe("supportsDuration / priceForDuration", () => {
	const support = productDurationSupport({ priceOptions: options });

	it("ne vend que les durées couvertes", () => {
		expect(supportsDuration(support, 1)).toBe(true);
		expect(supportsDuration(support, 2)).toBe(false);
		expect(supportsDuration(support, 3)).toBe(true);
	});

	it("refuse une durée invalide", () => {
		for (const durationDays of [0, -1, 1.5, Number.NaN]) {
			expect(supportsDuration(support, durationDays)).toBe(false);
			expect(priceForDuration(support, durationDays)).toBeNull();
		}
	});

	it("n'annonce aucun prix pour une durée non couverte", () => {
		expect(priceForDuration(support, 2)).toBeNull();
		expect(priceForDuration(support, 3)).toBe(30);
	});

	it("ne couvre aucune durée sans option", () => {
		const vide = productDurationSupport({ priceOptions: [] });
		for (const durationDays of [1, 2, 7, 30]) {
			expect(supportsDuration(vide, durationDays)).toBe(false);
		}
	});
});

describe("unpricedDurations", () => {
	// Ce matériel ne vend que 1 et 3 jours, pour 12 € et 30 €.
	const support = productDurationSupport({ priceOptions: options });

	it("refuse les durées affichées que le matériel ne vend pas", () => {
		const blocked = unpricedDurations({
			durations: [1, 2, 3, 7],
			support,
		});
		expect(blocked).toEqual([
			{ duration: 2, reason: "aucun tarif 2j pour ce matériel" },
			{ duration: 7, reason: "aucun tarif 7j pour ce matériel" },
		]);
	});

	it("laisse une durée déjà refusée pour un autre motif garder sa raison", () => {
		// La fermeture primant : une durée ne porte qu'un motif à l'écran.
		const blocked = unpricedDurations({
			durations: [1, 2, 3, 7],
			support,
			alreadyBlocked: [7],
		});
		expect(blocked.map((block) => block.duration)).toEqual([2]);
	});

	it("refuse aussi les durées sous le minimum de l'article", () => {
		// 1 jour est bien tarifé, mais l'article en exige 2 : le refus est
		// tarifaire, pas calendaire.
		const deuxJoursMinimum = productDurationSupport({
			priceOptions: [
				...options,
				{ id: "opt-2", duration: 2, label: "2 jours", price: "20.00" },
			],
			minDuration: 2,
		});
		const blocked = unpricedDurations({
			durations: [1, 2, 3],
			support: deuxJoursMinimum,
		});
		expect(blocked.map((block) => block.duration)).toEqual([1]);
	});

	it("ne refuse rien quand le matériel vend toutes les durées affichées", () => {
		expect(unpricedDurations({ durations: [1, 3], support })).toEqual([]);
	});

	it("refuse tout quand le matériel n'a aucun tarif", () => {
		const vide = productDurationSupport({ priceOptions: [] });
		expect(
			unpricedDurations({ durations: [1, 3], support: vide }).map(
				(block) => block.duration,
			),
		).toEqual([1, 3]);
	});
});

describe("parsePrice", () => {
	it("lit un prix numérique", () => {
		expect(parsePrice("12.00")).toBe(12);
		expect(parsePrice("0")).toBe(0);
		expect(parsePrice(" 84.50 ")).toBe(84.5);
	});

	it("refuse un prix qui n'est pas un nombre plutôt que de l'approximer", () => {
		// `Number.parseFloat("12,00")` vaudrait 12 : un prix en virgule ne doit
		// pas devenir un montant faux en silence.
		for (const price of [
			"",
			"sur devis",
			"12,00",
			"1 234,56",
			"12 €",
			"abc",
			"-5",
			null,
		]) {
			expect(parsePrice(price)).toBeNull();
		}
	});
});
