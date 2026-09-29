import { createStore, useStore } from "@tanstack/react-store";
import { addDaysToDateKey, countRentalDays } from "#/lib/dates";

/**
 * Panier de réservation publique. Volontairement non persistant : le panier
 * vit le temps de la session, la source de vérité restant la réservation en
 * base revalidée à chaque étape serveur.
 *
 * La sauvegarde dans le `sessionStorage` ne vit pas ici, dans
 * `public-cart-persistence.ts` : ce module est importé par des composants
 * rendus au SSR, où `sessionStorage` n'existe pas.
 */

export type PublicCartLine = {
	/** `variantId` + option de prix : une ligne par prix affiché. */
	key: string;
	productSlug: string;
	productName: string;
	activitySlug: string;
	activityName: string;
	variantId: string;
	/** Libellé de la variante (attributs) lisible par le client. */
	variantLabel: string;
	priceOptionId: string | null;
	/** Durée en jours correspondant au prix affiché. */
	duration: number;
	unitPrice: number;
	quantity: number;
	imageUrl: string | null;
};

export type PublicCartState = {
	lines: PublicCartLine[];
	/** Dates au format `YYYY-MM-DD`, volontairement hors URL. */
	pickupDate: string | null;
	returnDate: string | null;
};

export const publicCartStore = createStore<PublicCartState>({
	lines: [],
	pickupDate: null,
	returnDate: null,
});

/** Abonnement au panier : `usePublicCart((state) => state.lines)`. */
export function usePublicCart<T>(selector: (state: PublicCartState) => T): T {
	return useStore(publicCartStore, selector);
}

/**
 * Clé de ligne : variante + tarif. Exportée car la restauration depuis le
 * `sessionStorage` doit la recalculer plutôt que faire confiance à la valeur
 * sauvegardée.
 */
export function cartLineKey(input: {
	variantId: string;
	priceOptionId: string | null;
}): string {
	return `${input.variantId}:${input.priceOptionId ?? "daily"}`;
}

export function addPublicCartLine(line: PublicCartLine): void {
	publicCartStore.setState((state) => {
		const key = line.key || cartLineKey(line);
		const existing = state.lines.some((candidate) => candidate.key === key);
		if (!existing)
			return { ...state, lines: [...state.lines, { ...line, key }] };
		return {
			...state,
			lines: state.lines.map((candidate) =>
				candidate.key === key
					? { ...candidate, quantity: candidate.quantity + line.quantity }
					: candidate,
			),
		};
	});
}

export function setPublicCartLineQuantity(key: string, quantity: number): void {
	publicCartStore.setState((state) => ({
		...state,
		lines: state.lines
			.map((line) =>
				line.key === key ? { ...line, quantity: Math.max(0, quantity) } : line,
			)
			.filter((line) => line.quantity > 0),
	}));
}

export function removePublicCartLine(key: string): void {
	publicCartStore.setState((state) => ({
		...state,
		lines: state.lines.filter((line) => line.key !== key),
	}));
}

export function setPublicCartDates(dates: {
	pickupDate?: string | null;
	returnDate?: string | null;
}): void {
	publicCartStore.setState((state) => ({ ...state, ...dates }));
}

/**
 * Pose la fenêtre de location à partir d'une date de départ et d'une durée.
 *
 * Le retour est **toujours** déduit de la durée (bornes incluses) : c'est
 * l'invariant qui garantit qu'une réservation n'a qu'une seule période, donc
 * qu'un client ne peut pas louer un article 1 jour et un autre 2.
 */
export function setPublicCartWindow(window: {
	pickupDate: string | null;
	durationDays: number;
}): void {
	const pickup = window.pickupDate;
	if (!pickup || window.durationDays < 1) {
		publicCartStore.setState((state) => ({
			...state,
			pickupDate: pickup,
			returnDate: null,
		}));
		return;
	}
	publicCartStore.setState((state) => ({
		...state,
		pickupDate: pickup,
		returnDate: addDaysToDateKey(pickup, window.durationDays - 1),
	}));
}

/** Durée courante en jours, `0` si la fenêtre n'est pas complète. */
export function cartDurationDays(state: PublicCartState): number {
	if (!state.pickupDate || !state.returnDate) return 0;
	return countRentalDays(state.pickupDate, state.returnDate);
}

export function clearPublicCart(): void {
	publicCartStore.setState(() => ({
		lines: [],
		pickupDate: null,
		returnDate: null,
	}));
}

/** Nombre d'exemplaires (somme des quantités). */
export function cartItemCount(state: PublicCartState): number {
	return state.lines.reduce((total, line) => total + line.quantity, 0);
}

/**
 * Quantité déjà réservée dans le panier pour une variante, toutes durées
 * confondues : c'est le même stock physique. Le plafond de la fiche produit
 * s'en sert pour ne pas proposer plus que ce qu'il reste.
 */
export function cartVariantQuantity(
	state: PublicCartState,
	variantId: string,
): number {
	return state.lines
		.filter((line) => line.variantId === variantId)
		.reduce((total, line) => total + line.quantity, 0);
}

export function cartTotal(state: PublicCartState): number {
	return state.lines.reduce(
		(total, line) => total + line.unitPrice * line.quantity,
		0,
	);
}

export function formatPrice(value: number): string {
	return `${value.toFixed(2).replace(".", ",")} €`;
}
