import {
	describeVariantAttributes,
	type PublicVariant,
	type PublicWindowQuote,
} from "#/features/equipements/public-queries";
import {
	type ProductDurationSupport,
	productDurationSupport,
	supportsDuration,
} from "#/features/reservations/pricing";
import { rentalDurationLabel } from "#/lib/dates";

export type VariantEntry = {
	variant: PublicVariant;
	support: ProductDurationSupport;
};

/** Devis dont le prix est ferme : seul un tel devis permet d'ajouter au panier. */
export type BookableQuote = PublicWindowQuote & {
	unitPrice: number;
	priceOptionId: string;
};

export type VariantOption = {
	id: string;
	label: string;
	disabled: boolean;
	/** Précision à droite du libellé, déjà rédigée ; `null` si la variante est vendable. */
	note: string | null;
};

/** Ce qu'il faut dire en haut de la fiche : un seul message à la fois. */
export type ProductNotice =
	| { kind: "none" }
	| { kind: "not_bookable" }
	| { kind: "duration_not_priced" }
	| { kind: "blocked"; message: string };

export const STANDARD_VARIANT_LABEL = "Standard";

export function variantDisplayLabel(variant: PublicVariant): string {
	return (
		describeVariantAttributes(variant.attributes) ?? STANDARD_VARIANT_LABEL
	);
}

/**
 * Ce qu'une variante sait facturer, d'après les mêmes règles que le serveur
 * (durée minimale de l'article comprise).
 */
export function buildVariantEntries(
	variants: PublicVariant[],
	minDuration: number,
): VariantEntry[] {
	return variants
		.filter((variant) => variant.bookable)
		.map((variant) => ({
			variant,
			support: productDurationSupport({
				priceOptions: variant.priceOptions,
				minDuration,
			}),
		}));
}

export type SelectionInput = {
	entries: VariantEntry[];
	/** Variante choisie par le client ; peut ne plus être vendable. */
	chosenVariantId: string;
	hasWindow: boolean;
	durationDays: number;
	quotesByVariant: ReadonlyMap<string, PublicWindowQuote>;
	/** Les devis de la fenêtre courante sont arrivés. */
	quotesLoaded: boolean;
	productBookable: boolean;
	/** Durées vendues par le matériel, déjà filtrées par le serveur. */
	productDurations: number[];
};

export type Selection = {
	selected: PublicVariant | null;
	selectedQuote: PublicWindowQuote | null;
	bookableQuote: BookableQuote | null;
	allSoldOut: boolean;
	durationNotPriced: boolean;
	variantOptions: VariantOption[];
	notice: ProductNotice;
};

/**
 * Dérive la variante active, les options du sélecteur et l'unique message de la
 * fiche, **sans rien recalculer** : la disponibilité et le prix viennent des
 * devis, les refus sont ceux que le serveur a rédigés.
 */
export function deriveSelection(input: SelectionInput): Selection {
	const {
		entries,
		hasWindow,
		durationDays,
		quotesByVariant,
		quotesLoaded,
		productBookable,
		productDurations,
	} = input;

	// Une variante retenue ne doit mener nulle part : si elle ne couvre pas la
	// durée ou qu'il ne reste plus d'exemplaire, on bascule sur celle qui reste
	// vendable. Tant que les devis ne sont pas arrivés, on ne peut rien dire du
	// stock : la sélection se fait sur la durée, puis leur arrivée la corrige.
	const isUsable = (entry: VariantEntry): boolean => {
		if (hasWindow && !supportsDuration(entry.support, durationDays))
			return false;
		if (!quotesLoaded) return true;
		const quote = quotesByVariant.get(entry.variant.id);
		return quote?.status === "available" && quote.availableQuantity > 0;
	};
	const chosen =
		entries.find((entry) => entry.variant.id === input.chosenVariantId) ?? null;
	const active =
		chosen && isUsable(chosen) ? chosen : (entries.find(isUsable) ?? null);
	const selected = active?.variant ?? null;

	// Aucune variante vendable pour cette fenêtre : on distingue le stock épuisé,
	// qui est un coup de feu, d'un matériel retiré ou hors saison, qui ne se
	// réglera pas en changeant de date.
	const coveringEntries = hasWindow
		? entries.filter((entry) => supportsDuration(entry.support, durationDays))
		: [];
	const allSoldOut =
		hasWindow &&
		quotesLoaded &&
		selected === null &&
		coveringEntries.length > 0 &&
		coveringEntries.every((entry) => {
			const quote = quotesByVariant.get(entry.variant.id);
			return quote?.status === "available" && quote.availableQuantity === 0;
		});
	const blockedMessage =
		!hasWindow || selected !== null
			? null
			: allSoldOut
				? "Tous les exemplaires sont réservés ou loués sur ces dates."
				: (coveringEntries
						.map((entry) => quotesByVariant.get(entry.variant.id)?.message)
						.find((message) => Boolean(message)) ??
					"Ce matériel n’est pas louable sur ces dates.");

	// Aucune variante ne couvre la fenêtre choisie : c'est la durée le problème,
	// pas le matériel. `productDurations` vient du serveur, déjà filtré par la
	// durée minimale de l'article, donc la liste proposée est toujours vendable.
	const durationNotPriced =
		hasWindow && productBookable && !productDurations.includes(durationDays);

	const selectedQuote =
		hasWindow && selected ? (quotesByVariant.get(selected.id) ?? null) : null;

	const bookableQuote: BookableQuote | null =
		hasWindow &&
		selectedQuote?.status === "available" &&
		selectedQuote.unitPrice !== null &&
		selectedQuote.priceOptionId !== null
			? {
					...selectedQuote,
					unitPrice: selectedQuote.unitPrice,
					priceOptionId: selectedQuote.priceOptionId,
				}
			: null;

	const variantOptions = entries.map(({ variant, support }): VariantOption => {
		const offWindow = hasWindow && !supportsDuration(support, durationDays);
		// Une variante qui couvre la durée mais n'a plus d'exemplaire libre est
		// signalée ici : le client n'a pas à la sélectionner pour la découvrir vide.
		const quote = quotesByVariant.get(variant.id);
		const soldOut =
			!offWindow &&
			quote?.status === "available" &&
			quote.availableQuantity === 0;
		return {
			id: variant.id,
			label: variantDisplayLabel(variant),
			disabled: offWindow,
			note: offWindow
				? `indisponible sur ${rentalDurationLabel(durationDays).toLowerCase()}`
				: soldOut
					? "épuisé pour ces dates"
					: null,
		};
	});

	// Un seul message, par ordre de gravité. Le grisé des options et le libellé
	// du bouton restent des états, pas des messages.
	const notice: ProductNotice =
		entries.length === 0
			? { kind: "not_bookable" }
			: durationNotPriced
				? { kind: "duration_not_priced" }
				: blockedMessage
					? { kind: "blocked", message: blockedMessage }
					: { kind: "none" };

	return {
		selected,
		selectedQuote,
		bookableQuote,
		allSoldOut,
		durationNotPriced,
		variantOptions,
		notice,
	};
}
