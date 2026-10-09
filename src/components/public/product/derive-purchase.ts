import type { BookableQuote } from "#/components/public/product/derive-selection";
import type { PriceSummaryData } from "#/components/public/product/price-summary";
import type { StockTone } from "#/components/public/shared/stock-badge";
import type { PublicVariant } from "#/features/equipements/public-queries";
import { availabilityLabel } from "#/features/reservations/stock-labels";
import { rentalDurationLabel } from "#/lib/dates";
import { formatPrice } from "#/stores/public-cart.store";

export type PurchaseCtaIcon = "dates" | "duration" | "add";

export type PurchaseCta = {
	label: string;
	shortLabel: string;
	icon: PurchaseCtaIcon;
	disabled: boolean;
	/** Le bouton mène au sélecteur de dates au lieu d'ajouter au panier. */
	needsDates: boolean;
};

/**
 * Libellé et état du bouton d'achat, commun au desktop et à la barre mobile.
 * Sans dates, on déroule vers le sélecteur plutôt que d'échouer en silence.
 */
export function derivePurchaseCta(input: {
	hasWindow: boolean;
	durationNotPriced: boolean;
	soldOut: boolean;
	allSoldOut: boolean;
	/** Prix unitaire ferme du devis, `null` sans devis exploitable. */
	unitPrice: number | null;
	quantity: number;
}): PurchaseCta {
	const { hasWindow, durationNotPriced, soldOut, allSoldOut } = input;
	const needsDates = !hasWindow || durationNotPriced;
	const bookableNow = input.unitPrice !== null;
	const label = !hasWindow
		? "Choisir mes dates"
		: durationNotPriced
			? "Choisir une autre durée"
			: soldOut || allSoldOut
				? "Plus d’exemplaire disponible"
				: input.unitPrice !== null
					? `Ajouter à ma réservation (${formatPrice(input.unitPrice * input.quantity)})`
					: "Ajouter à ma réservation";

	const shortLabel = !hasWindow
		? "Choisir mes dates"
		: durationNotPriced
			? "Autre durée"
			: soldOut || allSoldOut
				? "Épuisé"
				: input.unitPrice !== null
					? `Ajouter · ${formatPrice(input.unitPrice * input.quantity)}`
					: "Ajouter";

	return {
		label,
		shortLabel,
		icon: !hasWindow ? "dates" : durationNotPriced ? "duration" : "add",
		disabled: !needsDates && (!bookableNow || soldOut),
		needsDates,
	};
}

/**
 * Prix de la variante choisie : le total du devis quand la fenêtre est
 * complète et vendable, sinon la liste de ses tarifs.
 */
export function derivePriceSummary(
	selected: PublicVariant | null,
	bookableQuote: BookableQuote | null,
): PriceSummaryData | null {
	if (!selected) return null;
	if (bookableQuote) {
		return {
			kind: "quote",
			durationLabel: rentalDurationLabel(
				bookableQuote.durationDays,
			).toLowerCase(),
			price: bookableQuote.unitPrice,
		};
	}
	return {
		kind: "list",
		options: selected.priceOptions.map((option) => ({
			id: option.id,
			label: option.label,
			price: Number(option.price),
		})),
	};
}

export type StockLine = { tone: StockTone; label: string };

/**
 * Ligne de stock sous le bouton d'achat. Sans fenêtre, seul le total en magasin
 * est connu ; avec fenêtre, on n'affiche que ce que le devis a dit rester libre.
 */
export function deriveStockLine(input: {
	hasSelection: boolean;
	hasWindow: boolean;
	/** Exemplaires en magasin de la variante choisie. */
	stock: number;
	/** Exemplaires libres selon le devis, `null` sans devis ferme. */
	quotedAvailable: number | null;
	alreadyInCart: number;
}): StockLine | null {
	if (!input.hasSelection) return null;
	const inCart =
		input.alreadyInCart > 0
			? ` — ${input.alreadyInCart} déjà dans votre panier`
			: "";
	if (!input.hasWindow) {
		return {
			tone: "unknown",
			label: `${availabilityLabel(input.stock, false)}${inCart}`,
		};
	}
	if (input.quotedAvailable === null) return null;
	const remaining = Math.max(0, input.quotedAvailable - input.alreadyInCart);
	return {
		tone: remaining > 0 ? "available" : "soldOut",
		label: `${availabilityLabel(input.quotedAvailable, true)}${inCart}`,
	};
}
