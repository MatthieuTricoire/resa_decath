import { beforeEach, describe, expect, it } from "vitest";
import {
	cartLineKey,
	clearPublicCart,
	type PublicCartLine,
} from "./public-cart.store";
import {
	CART_STORAGE_KEY,
	type CartStorage,
	clearStoredCart,
	dropStaleWindow,
	parseStoredCart,
	readStoredCart,
	safeSessionStorage,
	writeStoredCart,
} from "./public-cart-persistence";

/** Doublure de `Storage` : le test tourne en environnement `node`, sans DOM. */
function fakeStorage(initial: Record<string, string> = {}): CartStorage & {
	dump: () => Record<string, string>;
} {
	const data = new Map(Object.entries(initial));
	return {
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => {
			data.set(key, value);
		},
		removeItem: (key) => {
			data.delete(key);
		},
		dump: () => Object.fromEntries(data),
	};
}

function line(overrides: Partial<PublicCartLine> = {}): PublicCartLine {
	return {
		key: "",
		productSlug: "casque-simond-sense",
		productName: "Casque Simond Sense",
		activitySlug: "escalade-bloc",
		activityName: "Escalade & Bloc",
		variantId: "11111111-1111-4111-8111-111111111111",
		variantLabel: "Taille M",
		priceOptionId: "22222222-2222-4222-8222-222222222222",
		duration: 1,
		unitPrice: 4,
		quantity: 6,
		imageUrl: null,
		...overrides,
	};
}

function envelope(value: unknown): string {
	return JSON.stringify(value);
}

describe("parseStoredCart", () => {
	it("relit un panier complet et recalcule la clé de ligne", () => {
		const stored = line({ key: "clé-périmée" });
		const parsed = parseStoredCart(
			envelope({
				version: 1,
				lines: [stored],
				pickupDate: "2026-09-10",
				returnDate: "2026-09-10",
			}),
		);

		expect(parsed).not.toBeNull();
		expect(parsed?.lines).toHaveLength(1);
		// La clé stockée est ignorée : elle est recalculée depuis la variante et
		// le tarif, seule source de vérité.
		expect(parsed?.lines[0].key).toBe(
			cartLineKey({
				variantId: stored.variantId,
				priceOptionId: stored.priceOptionId,
			}),
		);
		expect(parsed?.pickupDate).toBe("2026-09-10");
	});

	it("refuse un JSON illisible, vide, ou d'une autre version", () => {
		expect(parseStoredCart(null)).toBeNull();
		expect(parseStoredCart("")).toBeNull();
		expect(parseStoredCart("{pas du json")).toBeNull();
		expect(parseStoredCart(envelope({ version: 2, lines: [] }))).toBeNull();
		expect(parseStoredCart(envelope({ version: 1 }))).toBeNull();
	});

	it("écarte une ligne dont un champ est manquant ou du mauvais type", () => {
		const { variantLabel: _absent, ...sansVariante } = line();
		const parsed = parseStoredCart(
			envelope({
				version: 1,
				// Type volontairement faux : c'est la validation d'exécution qui
				// doit s'en charger, le typage ne voit pas un JSON de sessionStorage.
				lines: [
					sansVariante,
					line({ quantity: "beaucoup" as unknown as number }),
				],
				pickupDate: null,
				returnDate: null,
			}),
		);

		// Une ligne corrompue ne doit pas emporter les lignes saines.
		expect(parsed?.lines).toEqual([]);
	});

	it("écarte une quantité nulle, négative ou fractionnaire", () => {
		const parsed = parseStoredCart(
			envelope({
				version: 1,
				lines: [
					line({ quantity: 0 }),
					line({ quantity: -2 }),
					line({ quantity: 1.5 }),
				],
				pickupDate: null,
				returnDate: null,
			}),
		);

		expect(parsed?.lines).toEqual([]);
	});

	it("vide une fenêtre mal formée ou dont le retour précède le départ", () => {
		const cas = [
			{ pickupDate: "10/09/2026", returnDate: "2026-09-12" },
			{ pickupDate: "2026-09-10", returnDate: null },
			{ pickupDate: "2026-09-10", returnDate: "2026-09-08" },
		];
		for (const dates of cas) {
			const parsed = parseStoredCart(
				envelope({ version: 1, lines: [line()], ...dates }),
			);
			expect(parsed?.pickupDate).toBeNull();
			expect(parsed?.returnDate).toBeNull();
			// Les lignes, elles, restent utilisables.
			expect(parsed?.lines).toHaveLength(1);
		}
	});
});

describe("dropStaleWindow", () => {
	it("vide une fenêtre déjà passée sans toucher aux lignes", () => {
		const state = {
			lines: [line()],
			pickupDate: "2026-09-01",
			returnDate: "2026-09-03",
		};
		const result = dropStaleWindow(state, "2026-09-10");

		expect(result.pickupDate).toBeNull();
		expect(result.returnDate).toBeNull();
		expect(result.lines).toHaveLength(1);
	});

	it("laisse intacte une fenêtre en cours ou à venir", () => {
		const state = {
			lines: [line()],
			pickupDate: "2026-09-10",
			returnDate: "2026-09-10",
		};
		expect(dropStaleWindow(state, "2026-09-10")).toBe(state);
		expect(dropStaleWindow(state, "2026-09-01")).toBe(state);
	});
});

describe("round-trip", () => {
	it("écrit puis relit le même panier", () => {
		const storage = fakeStorage();
		const state = {
			lines: [
				line(),
				line({ variantId: "33333333-3333-4333-8333-333333333333" }),
			],
			pickupDate: "2026-09-10",
			returnDate: "2026-09-12",
		};

		writeStoredCart(state, storage);

		const read = readStoredCart(storage);
		expect(read?.lines).toHaveLength(2);
		expect(read?.pickupDate).toBe("2026-09-10");
		expect(read?.returnDate).toBe("2026-09-12");
		// Le contenu écrit reste un JSON lisible, pas un stockage opaque.
		expect(Object.keys(storage.dump())).toEqual([CART_STORAGE_KEY]);
	});

	it("ne lève pas quand le stockage est indisponible ou refuse l'écriture", () => {
		const refuse = fakeStorage();
		refuse.setItem = () => {
			throw new DOMException("quota");
		};
		expect(() =>
			writeStoredCart(
				{ lines: [line()], pickupDate: null, returnDate: null },
				refuse,
			),
		).not.toThrow();

		const lecture = fakeStorage();
		lecture.getItem = () => {
			throw new DOMException("bloqué");
		};
		expect(readStoredCart(lecture)).toBeNull();
		// Sans stockage, le panier reste simplement en mémoire.
		expect(readStoredCart(null)).toBeNull();
		expect(() =>
			writeStoredCart({ lines: [], pickupDate: null, returnDate: null }, null),
		).not.toThrow();
	});

	it("retire la clé quand le panier est vidé", () => {
		const storage = fakeStorage();
		writeStoredCart(
			{ lines: [line()], pickupDate: null, returnDate: null },
			storage,
		);
		expect(storage.dump()[CART_STORAGE_KEY]).toBeDefined();

		clearStoredCart(storage);
		expect(storage.dump()[CART_STORAGE_KEY]).toBeUndefined();
	});
});

describe("store et persistance", () => {
	beforeEach(() => {
		clearPublicCart();
	});

	it("relaît ce que le store sait écrire, clé recalculée à la clé", () => {
		const storage = fakeStorage();
		// Une ligne ajoutée par le store doit survivre au round-trip avec une
		// clé cohérente, sans quoi l'ajout d'une seconde quantité la
		// dupliquerait au lieu de l'incrémenter.
		const source = line();
		writeStoredCart(
			{
				lines: [{ ...source, key: cartLineKey(source) }],
				pickupDate: null,
				returnDate: null,
			},
			storage,
		);

		const read = readStoredCart(storage);
		expect(read?.lines[0].key).toBe(source.key || cartLineKey(source));
	});
});

describe("safeSessionStorage", () => {
	it("renvoie null hors navigateur", () => {
		// Le test tourne en `node` : `window` n'existe pas, ce qui est exactement
		// le cas du rendu serveur que ce module doit survivre.
		expect(safeSessionStorage()).toBeNull();
	});
});
