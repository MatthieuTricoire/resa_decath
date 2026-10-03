import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	getPublicWindowQuotes,
	type PublicWindowQuote,
} from "#/features/equipements/public-queries";
import { cartDurationDays, usePublicCart } from "#/stores/public-cart.store";

/**
 * Devis serveur de toutes les variantes vendables d'une fiche, pour la fenêtre
 * du panier. Un seul aller-retour : c'est ce qui permet d'afficher « épuisé » sur
 * une variante avant que le client ne la sélectionne.
 *
 * Le serveur reste maître du prix et du stock : même logique que la réservation
 * finale, saison comprise, donc impossible d'annoncer un total que le serveur
 * refusera.
 */
export function useProductWindowQuotes(variantIds: string[]) {
	const pickupDate = usePublicCart((state) => state.pickupDate);
	const returnDate = usePublicCart((state) => state.returnDate);
	// Inclusive des deux dates, comme `getReservationDurationDays` côté serveur.
	const durationDays = usePublicCart(cartDurationDays);
	const hasWindow = durationDays > 0 && Boolean(pickupDate && returnDate);

	// Clé de requête : la liste est triée pour que deux rendus successifs
	// produisent la même clé.
	const sortedIds = [...variantIds].sort();
	const quote = useQuery({
		queryKey: [
			"public",
			"window-quotes",
			{ pickupDate, returnDate, variantIds: sortedIds },
		],
		queryFn: () =>
			getPublicWindowQuotes({
				data: {
					pickupDate: pickupDate ?? "",
					returnDate: returnDate ?? "",
					variantIds: sortedIds,
				},
			}),
		enabled: hasWindow && sortedIds.length > 0,
		staleTime: 60 * 1000,
	});

	const quotesByVariant = useMemo(() => {
		const byVariant = new Map<string, PublicWindowQuote>();
		for (const line of quote.data ?? []) byVariant.set(line.variantId, line);
		return byVariant;
	}, [quote.data]);

	return {
		hasWindow,
		durationDays,
		quotesByVariant,
		quotesLoaded: hasWindow && (quote.data?.length ?? 0) > 0,
		isFetching: quote.isFetching,
	};
}
