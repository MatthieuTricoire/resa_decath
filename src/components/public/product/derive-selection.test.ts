import { describe, expect, it } from "vitest";
import type {
	PublicVariant,
	PublicWindowQuote,
} from "#/features/equipements/public-queries";
import {
	buildVariantEntries,
	deriveSelection,
	type SelectionInput,
} from "./derive-selection";

function variant(id: string, durations: number[]): PublicVariant {
	return {
		id,
		attributes: [{ name: "Taille", value: id }],
		priceOptions: durations.map((duration) => ({
			id: `${id}-${duration}`,
			duration,
			label: `${duration}j`,
			price: String(duration * 10),
		})),
		bookable: durations.length > 0,
		stock: 3,
	};
}

function quote(
	variantId: string,
	overrides: Partial<PublicWindowQuote> = {},
): PublicWindowQuote {
	return {
		variantId,
		status: "available",
		reason: null,
		message: null,
		durationDays: 2,
		priceOptionId: `${variantId}-2`,
		unitPrice: 20,
		label: "2j",
		availableQuantity: 2,
		...overrides,
	};
}

function input(overrides: Partial<SelectionInput> = {}): SelectionInput {
	const entries = buildVariantEntries(
		[variant("S", [1, 2]), variant("M", [1, 2])],
		1,
	);
	return {
		entries,
		chosenVariantId: "S",
		hasWindow: true,
		durationDays: 2,
		quotesByVariant: new Map([
			["S", quote("S")],
			["M", quote("M")],
		]),
		quotesLoaded: true,
		productBookable: true,
		productDurations: [1, 2],
		...overrides,
	};
}

describe("deriveSelection — message unique", () => {
	it("ne dit rien quand une variante est vendable", () => {
		const result = deriveSelection(input());
		expect(result.notice).toEqual({ kind: "none" });
		expect(result.selected?.id).toBe("S");
		expect(result.bookableQuote?.unitPrice).toBe(20);
	});

	it("bascule sur une variante vendable quand la choisie est épuisée", () => {
		const result = deriveSelection(
			input({
				quotesByVariant: new Map([
					["S", quote("S", { availableQuantity: 0 })],
					["M", quote("M")],
				]),
			}),
		);
		expect(result.selected?.id).toBe("M");
		expect(result.notice.kind).toBe("none");
		expect(result.variantOptions[0].note).toBe("épuisé pour ces dates");
	});

	it("annonce la rupture totale, sans durée non tarifée", () => {
		const result = deriveSelection(
			input({
				quotesByVariant: new Map([
					["S", quote("S", { availableQuantity: 0 })],
					["M", quote("M", { availableQuantity: 0 })],
				]),
			}),
		);
		expect(result.allSoldOut).toBe(true);
		expect(result.notice).toEqual({
			kind: "blocked",
			message: "Tous les exemplaires sont réservés ou loués sur ces dates.",
		});
	});

	it("ne garde que la durée non tarifée quand elle explique aussi l'absence de variante", () => {
		const result = deriveSelection(input({ durationDays: 5 }));
		expect(result.selected).toBeNull();
		// Les deux conditions sont vraies, un seul message sort.
		expect(result.durationNotPriced).toBe(true);
		expect(result.notice).toEqual({ kind: "duration_not_priced" });
		expect(result.variantOptions.every((option) => option.disabled)).toBe(true);
	});

	it("relaie le message du serveur quand une variante est refusée", () => {
		const result = deriveSelection(
			input({
				quotesByVariant: new Map([
					["S", quote("S", { status: "unavailable", message: "Hors saison." })],
					["M", quote("M", { status: "unavailable", message: "Hors saison." })],
				]),
			}),
		);
		expect(result.notice).toEqual({ kind: "blocked", message: "Hors saison." });
	});

	it("signale un matériel sans variante vendable", () => {
		const result = deriveSelection(input({ entries: [] }));
		expect(result.notice).toEqual({ kind: "not_bookable" });
	});

	it("ne dit rien sans fenêtre", () => {
		const result = deriveSelection(
			input({ hasWindow: false, durationDays: 0, quotesLoaded: false }),
		);
		expect(result.notice).toEqual({ kind: "none" });
		expect(result.bookableQuote).toBeNull();
	});
});
