import { beforeEach, describe, expect, it } from "vitest";
import {
	addPublicCartLine,
	cartDurationDays,
	cartVariantQuantity,
	clearPublicCart,
	type PublicCartLine,
	publicCartStore,
	setPublicCartWindow,
} from "./public-cart.store";

describe("setPublicCartWindow", () => {
	beforeEach(() => {
		clearPublicCart();
	});

	it("déduit le retour de la durée, bornes incluses", () => {
		setPublicCartWindow({ pickupDate: "2026-04-12", durationDays: 3 });
		expect(publicCartStore.state.pickupDate).toBe("2026-04-12");
		expect(publicCartStore.state.returnDate).toBe("2026-04-14");
	});

	it("consulte le retrait et le retour pour une journée", () => {
		setPublicCartWindow({ pickupDate: "2026-04-12", durationDays: 1 });
		expect(publicCartStore.state.returnDate).toBe("2026-04-12");
		expect(cartDurationDays(publicCartStore.state)).toBe(1);
	});

	it("franchit correctement les fins de mois", () => {
		setPublicCartWindow({ pickupDate: "2026-04-28", durationDays: 7 });
		expect(publicCartStore.state.returnDate).toBe("2026-05-04");
		expect(cartDurationDays(publicCartStore.state)).toBe(7);
	});

	it("efface la fenêtre si la date de départ disparaît", () => {
		setPublicCartWindow({ pickupDate: "2026-04-12", durationDays: 3 });
		setPublicCartWindow({ pickupDate: null, durationDays: 0 });
		expect(publicCartStore.state.pickupDate).toBeNull();
		expect(publicCartStore.state.returnDate).toBeNull();
		expect(cartDurationDays(publicCartStore.state)).toBe(0);
	});

	it("refuse une durée nulle en gardant la date de départ", () => {
		setPublicCartWindow({ pickupDate: "2026-04-12", durationDays: 0 });
		expect(publicCartStore.state.pickupDate).toBe("2026-04-12");
		expect(publicCartStore.state.returnDate).toBeNull();
	});

	it("ne conserve pas les lignes du panier", () => {
		setPublicCartWindow({ pickupDate: "2026-04-12", durationDays: 2 });
		const before = publicCartStore.state.lines;
		setPublicCartWindow({ pickupDate: "2026-04-20", durationDays: 5 });
		expect(publicCartStore.state.lines).toBe(before);
	});
});

describe("cartVariantQuantity", () => {
	beforeEach(() => {
		clearPublicCart();
	});

	const line = (
		overrides: Partial<PublicCartLine> & { variantId: string },
	): PublicCartLine => ({
		// Clé dérivée par le store : une ligne par variante et option de prix.
		key: "",
		productSlug: "casque-simond",
		productName: "Casque Simond",
		activitySlug: "alpinisme",
		activityName: "Alpinisme",
		variantLabel: "Taille unique",
		priceOptionId: "opt-1j",
		duration: 1,
		unitPrice: 5,
		quantity: 1,
		imageUrl: null,
		...overrides,
	});

	it("compte les lignes de la variante, durées confondues", () => {
		addPublicCartLine(line({ variantId: "v-casque", quantity: 2 }));
		addPublicCartLine(line({ variantId: "v-sac", quantity: 4 }));
		addPublicCartLine(
			line({ variantId: "v-casque", quantity: 1, priceOptionId: "opt-3j" }),
		);

		expect(cartVariantQuantity(publicCartStore.state, "v-casque")).toBe(3);
		expect(cartVariantQuantity(publicCartStore.state, "v-sac")).toBe(4);
		expect(cartVariantQuantity(publicCartStore.state, "v-absent")).toBe(0);
	});
});
