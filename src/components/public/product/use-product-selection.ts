import { useMemo, useState } from "react";
import type { PublicProduct } from "#/features/equipements/public-queries";
import { buildVariantEntries, deriveSelection } from "./derive-selection";
import { useProductWindowQuotes } from "./use-product-window-quotes";

/**
 * Variante active, options du sélecteur et message unique de la fiche. Lit la
 * fenêtre dans le store du panier : aucune date n'est dupliquée ici.
 */
export function useProductSelection(product: PublicProduct) {
	const entries = useMemo(
		() => buildVariantEntries(product.variants, product.minDuration),
		[product.variants, product.minDuration],
	);
	const [chosenVariantId, setChosenVariantId] = useState(
		entries[0]?.variant.id ?? "",
	);
	const window = useProductWindowQuotes(
		entries.map((entry) => entry.variant.id),
	);

	const selection = deriveSelection({
		entries,
		chosenVariantId,
		hasWindow: window.hasWindow,
		durationDays: window.durationDays,
		quotesByVariant: window.quotesByVariant,
		quotesLoaded: window.quotesLoaded,
		productBookable: product.bookable,
		productDurations: product.durations,
	});

	// Ce que le sélecteur sait déjà facturer, pour griser d'emblée les durées du
	// catalogue que ce matériel ne vend pas. Mémoïsé : le sélecteur en fait une
	// dépendance de mémo, qu'un objet reconstruit à chaque rendu invaliderait.
	const durationSupport = useMemo(
		() => ({
			durations: product.durations,
			priceByDuration: product.priceByDuration,
		}),
		[product.durations, product.priceByDuration],
	);

	return {
		...selection,
		hasWindow: window.hasWindow,
		durationDays: window.durationDays,
		isFetching: window.isFetching,
		selectedId: selection.selected?.id ?? null,
		chooseVariant: setChosenVariantId,
		durationSupport,
	};
}
