import { describe, expect, it } from "vitest";
import { derivePurchaseCta, deriveStockLine } from "./derive-purchase";

const base = {
	hasWindow: true,
	durationNotPriced: false,
	soldOut: false,
	allSoldOut: false,
	unitPrice: 12.5,
	quantity: 2,
};

describe("derivePurchaseCta", () => {
	it("mène aux dates quand la fenêtre manque", () => {
		const cta = derivePurchaseCta({
			...base,
			hasWindow: false,
			unitPrice: null,
		});
		expect(cta).toMatchObject({
			label: "Choisir mes dates",
			needsDates: true,
			disabled: false,
		});
	});

	it("propose une autre durée quand celle-ci n'est pas tarifée", () => {
		const cta = derivePurchaseCta({ ...base, durationNotPriced: true });
		expect(cta).toMatchObject({ icon: "duration", needsDates: true });
	});

	it("affiche le total virgule à l'appui", () => {
		expect(derivePurchaseCta(base).label).toBe(
			"Ajouter à ma réservation (25,00 €)",
		);
		expect(derivePurchaseCta(base).shortLabel).toBe("Ajouter · 25,00 €");
	});

	it("désactive le bouton en rupture ou sans devis ferme", () => {
		expect(derivePurchaseCta({ ...base, soldOut: true }).disabled).toBe(true);
		expect(derivePurchaseCta({ ...base, unitPrice: null }).disabled).toBe(true);
	});
});

describe("deriveStockLine", () => {
	const stock = {
		hasSelection: true,
		hasWindow: true,
		stock: 5,
		quotedAvailable: 3,
		alreadyInCart: 0,
	};

	it("ne dit rien sans variante", () => {
		expect(deriveStockLine({ ...stock, hasSelection: false })).toBeNull();
	});

	it("parle de stock en magasin sans fenêtre", () => {
		expect(deriveStockLine({ ...stock, hasWindow: false })).toEqual({
			tone: "unknown",
			label: "5 exemplaires en stock",
		});
	});

	it("n'invente pas « 0 disponible » en attendant le devis", () => {
		expect(deriveStockLine({ ...stock, quotedAvailable: null })).toBeNull();
	});

	it("passe en rupture quand le panier retient tout", () => {
		expect(deriveStockLine({ ...stock, alreadyInCart: 3 })).toEqual({
			tone: "soldOut",
			label:
				"3 exemplaires disponibles pour ces dates — 3 déjà dans votre panier",
		});
	});
});
