import {
	type BlockedDuration,
	closedReturnDurations,
	type OpeningDaysSettings,
} from "#/features/reservations/opening-days";
import {
	type ProductDurationSupport,
	unpricedDurations,
} from "#/features/reservations/pricing";

export type BlockedDurationsView = {
	/** Durées grisées, avec la raison rédigée par le module qui refuse. */
	blockedDurations: BlockedDuration[];
	/** Remarque qui explique ces durées ; `null` quand aucune n'est grisée. */
	note: string | null;
};

const NOTE_PREFIX = "Certaines durées sont indisponibles";

/**
 * Durées refusées pour la date de retrait choisie, et la remarque qui les
 * explique. Les boutons grisés et la remarque sont dérivés de **la même liste** :
 * la remarque ne peut pas annoncer un refus absent de l'écran. La fermeture passe
 * en premier, le tarifaire complète (`alreadyBlocked`).
 */
export function deriveBlockedDurations({
	pickupDate,
	durations,
	settings,
	durationSupport,
}: {
	pickupDate: string | null;
	durations: number[];
	settings?: OpeningDaysSettings;
	durationSupport?: ProductDurationSupport;
}): BlockedDurationsView {
	const closed =
		pickupDate && settings
			? closedReturnDurations({ pickupDate, durations, settings })
			: [];
	const unpriced = durationSupport
		? unpricedDurations({
				durations,
				support: durationSupport,
				alreadyBlocked: closed.map((block) => block.duration),
			})
		: [];

	const note = closed.length
		? unpriced.length
			? `${NOTE_PREFIX} : retour un jour de fermeture du magasin, ou durée non proposée pour ce matériel.`
			: `${NOTE_PREFIX} : le retour tomberait un jour de fermeture du magasin.`
		: unpriced.length
			? `${NOTE_PREFIX} : ce matériel ne se loue pas sur ces durées.`
			: null;

	return { blockedDurations: [...closed, ...unpriced], note };
}
