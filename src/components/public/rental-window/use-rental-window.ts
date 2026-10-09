import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { queryKeys } from "#/features/durees/query-keys";
import {
	getPublicRentalDurations,
	getPublicStoreSchedule,
} from "#/features/equipements/public-queries";
import { resolveDuration } from "#/features/reservations/opening-days";
import {
	DEFAULT_LAST_SAME_DAY_PICKUP_HOUR,
	earliestPickupDateInParis,
} from "#/lib/dates";
import {
	cartDurationDays,
	setPublicCartWindow,
	usePublicCart,
} from "#/stores/public-cart.store";

/**
 * Données et action de la fenêtre de location côté client : durées du catalogue,
 * horaires d'ouverture, première date proposable et pose de la fenêtre dans le
 * store du panier.
 *
 * Seule voie d'écriture de la fenêtre : `applyWindow` passe par
 * `setPublicCartWindow` (le retour se déduit toujours de la durée) après avoir
 * rabattu la durée sur une durée servie. La fiche produit et le sélecteur s'en
 * servent tous deux, plutôt que de refaire chacun ce calcul.
 */
export function useRentalWindow() {
	const pickupDate = usePublicCart((state) => state.pickupDate);
	const returnDate = usePublicCart((state) => state.returnDate);
	const durationDays = usePublicCart(cartDurationDays);

	const durationsQuery = useQuery({
		queryKey: queryKeys.publicDurations,
		queryFn: () => getPublicRentalDurations(),
		staleTime: 5 * 60 * 1000,
	});
	const scheduleQuery = useQuery({
		queryKey: ["public", "store-schedule"],
		queryFn: () => getPublicStoreSchedule(),
		staleTime: 5 * 60 * 1000,
	});

	const catalogDurations = useMemo(
		() => durationsQuery.data ?? [],
		[durationsQuery.data],
	);
	const settings = scheduleQuery.data;

	const earliestPickupDate = earliestPickupDateInParis(
		settings?.lastSameDayPickupHour ?? DEFAULT_LAST_SAME_DAY_PICKUP_HOUR,
	);

	/**
	 * Pose la fenêtre et renvoie la durée réellement appliquée (`0` quand aucune
	 * durée candidate ne rend le matériel un jour ouvert). `candidates` restreint
	 * les durées servies, par exemple à celles d'un matériel.
	 */
	const applyWindow = useCallback(
		(
			nextPickup: string,
			requestedDuration: number,
			candidates?: number[],
		): number => {
			const durations = candidates ?? catalogDurations;
			const duration =
				!settings || durations.length === 0
					? requestedDuration
					: (resolveDuration({
							pickupDate: nextPickup,
							requestedDuration,
							durations,
							settings,
						}) ?? 0);
			setPublicCartWindow({ pickupDate: nextPickup, durationDays: duration });
			return duration;
		},
		[settings, catalogDurations],
	);

	return {
		pickupDate,
		returnDate,
		durationDays,
		catalogDurations,
		isDurationsPending: durationsQuery.isPending,
		settings,
		earliestPickupDate,
		applyWindow,
	};
}
