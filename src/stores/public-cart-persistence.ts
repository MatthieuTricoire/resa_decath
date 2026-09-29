import {
	cartLineKey,
	type PublicCartLine,
	type PublicCartState,
} from "#/stores/public-cart.store";

/**
 * Sauvegarde du panier de réservation dans le `sessionStorage`.
 *
 * Le store lui-même est un singleton mémoire : il survit aux navigations
 * internes du routeur, mais repart vide dès qu'un vrai rechargement de document
 * a lieu (bouton « précédent » au-delà de la première entrée, F5, ouverture
 * dans un nouvel onglet). Ce module comble exactement ce trou.
 *
 * `sessionStorage` et non `localStorage` : le panier ne survit pas à la
 * fermeture de l'onglet. C'est un choix — un panier de plusieurs jours garde
 * des prix et des stocks figés, et le devis serveur les revalide de toute
 * façon. `sessionStorage` est aussi **par onglet**, donc deux onglets ont deux
 * paniers indépendants et l'événement `storage` ne peut rien synchroniser entre
 * eux.
 *
 * Ce module ne touche jamais `window` au chargement : il est importé par des
 * composants rendus au SSR, où `sessionStorage` n'existe pas.
 */

/** Versionné : un blob d'une version antérieure est ignoré, pas interprété. */
export const CART_STORAGE_KEY = "resa-decath:cart:v1";

const CART_VERSION = 1;

/**
 * Le strict nécessaire du `Storage`, pour qu'un test passe une doublure sans
 * DOM. Volontairement plus étroit que `Storage` : on n'a besoin que de ces
 * trois opérations.
 */
export type CartStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * `sessionStorage` ou `null`. L'accès lui-même lève quand les cookies sont
 * bloqués, pas seulement l'écriture : on enveloppe donc les deux.
 */
export function safeSessionStorage(): CartStorage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

type PersistedCart = {
	version: number;
	lines: PublicCartLine[];
	pickupDate: string | null;
	returnDate: string | null;
};

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
	return value === null || isString(value);
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isDateKey(value: unknown): value is string {
	return isString(value) && DATE_KEY.test(value);
}

/**
 * Fenêtre de location relue depuis le stockage : les deux dates doivent être
 * présentes, bien formées, et le retour ne pas précéder le départ. Le prix des
 * lignes est volontairement conservé tel quel — le devis serveur le revalide,
 * et une date fantaisiste se traduirait par un message incompréhensible
 * plutôt que par un panier vide.
 */
function parseWindow(
	pickup: unknown,
	returned: unknown,
): {
	pickupDate: string | null;
	returnDate: string | null;
} {
	if (!isDateKey(pickup) || !isDateKey(returned)) {
		return { pickupDate: null, returnDate: null };
	}
	if (returned < pickup) return { pickupDate: null, returnDate: null };
	return { pickupDate: pickup, returnDate: returned };
}

/**
 * Une ligne n'est acceptée que si **tous** ses champs sont du bon type : une
 * ligne corrompue est retirée, elle ne doit pas contamine tout le panier. La
 * clé est recalculée plutôt que lue, pour qu'un panier sauvegardé avant un
 * changement de schéma de clé se réconcilie tout seul.
 */
function parseLine(value: unknown): PublicCartLine | null {
	if (typeof value !== "object" || value === null) return null;
	const line = value as Record<string, unknown>;
	const { key: _ignoredKey, ...rest } = line;
	if (
		!isString(rest.productSlug) ||
		!isString(rest.productName) ||
		!isString(rest.activitySlug) ||
		!isString(rest.activityName) ||
		!isString(rest.variantId) ||
		!isString(rest.variantLabel) ||
		!isNullableString(rest.priceOptionId) ||
		!isPositiveInteger(rest.duration) ||
		typeof rest.unitPrice !== "number" ||
		!Number.isFinite(rest.unitPrice) ||
		!isPositiveInteger(rest.quantity) ||
		!isNullableString(rest.imageUrl)
	) {
		return null;
	}
	const parsed = { ...rest } as PublicCartLine;
	return { ...parsed, key: cartLineKey(parsed) };
}

/**
 * Relit un panier sérialisé. Renvoie `null` si le blob est illisible ou
 * d'une autre version : mieux vaut un panier vide qu'un panier à moitié
 * restauré, et un JSON corrompu ne doit jamais faire tomber la page.
 */
export function parseStoredCart(raw: string | null): PublicCartState | null {
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;
	const envelope = parsed as Partial<PersistedCart>;
	if (envelope.version !== CART_VERSION || !Array.isArray(envelope.lines)) {
		return null;
	}
	const window = parseWindow(envelope.pickupDate, envelope.returnDate);
	return {
		lines: envelope.lines
			.map(parseLine)
			.filter((line): line is PublicCartLine => line !== null),
		...window,
	};
}

/**
 * Vide une fenêtre déjà passée, en conservant le contenu : un panier laissé
 * ouvert la veille revient sinon avec tous ses devis en rupture, sans raison
 * apparente. Les lignes, elles, restent valables.
 */
export function dropStaleWindow(
	state: PublicCartState,
	today: string,
): PublicCartState {
	if (!state.pickupDate || state.pickupDate >= today) return state;
	return { ...state, pickupDate: null, returnDate: null };
}

export function readStoredCart(
	storage: CartStorage | null,
): PublicCartState | null {
	if (!storage) return null;
	try {
		return parseStoredCart(storage.getItem(CART_STORAGE_KEY));
	} catch {
		return null;
	}
}

export function writeStoredCart(
	state: PublicCartState,
	storage: CartStorage | null,
): void {
	if (!storage) return;
	const payload: PersistedCart = {
		version: CART_VERSION,
		lines: state.lines,
		pickupDate: state.pickupDate,
		returnDate: state.returnDate,
	};
	try {
		storage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// Quota atteint ou stockage refusé (navigation privée) : le panier reste
		// en mémoire, ce qui est le comportement d'avant.
	}
}

export function clearStoredCart(storage: CartStorage | null): void {
	if (!storage) return;
	try {
		storage.removeItem(CART_STORAGE_KEY);
	} catch {
		// Rien à faire : le store est déjà vidé en mémoire.
	}
}
