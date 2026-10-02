import {
	type BlockedDuration,
	closedReturnDurations,
	type OpeningDaysSettings,
	resolveDuration,
	returnDateForDuration,
} from "#/features/reservations/opening-days";
import {
	type PriceOptionLike,
	productDurationSupport,
	unpricedDurations,
} from "#/features/reservations/pricing";

/**
 * Fenêtre de location d'une réservation saisie au comptoir.
 *
 * La saisie du backoffice suit le site public — une date de départ puis une
 * durée — mais les contraintes ne sont pas les mêmes : ici la durée est choisie
 * *avant* l'article, alors que sur le site l'article est déjà connu. La caisse
 * doit donc pouvoir refuser une durée pour deux motifs, dont un qui n'existe que
 * parce que le matériel vient d'être choisi.
 *
 * Ce module ne touche pas la base : il reçoit le réglage, les durées de
 * référence et le catalogue du matériel sélectionné, et répond. Il est la
 * contrepartie testée de ce que fait la page `reservations/ajouter`, qui se
 * contente de lire ces résultats.
 */

/** Fenêtre complète, bornes incluses, telle qu'elle sera enregistrée. */
export type CheckoutWindow = {
	pickupDate: string;
	returnDate: string;
	durationDays: number;
};

/**
 * Fenêtre à appliquer pour une date de retrait et une durée demandées.
 *
 * La durée demandée est conservée si elle convient encore, sinon remplacée par la
 * plus proche servie — changer de date peut invalider la durée courante, du
 * vendredi plus 2 jours qui finit un dimanche. `null` signifie qu'aucune fenêtre
 * n'est possible : aucune durée ne se termine un jour d'ouverture. L'appelant doit
 * alors laisser la fenêtre vide, plutôt que de faire enregistrer un retour que le
 * serveur refusera.
 */
export function resolveCheckoutWindow({
	pickupDate,
	requestedDuration,
	durations,
	settings,
}: {
	/** Date de retrait demandée, ou `null`/`""` pour vider la fenêtre. */
	pickupDate: string | null;
	/** Durée demandée, ou `null` pour ne garder qu'une date de départ. */
	requestedDuration: number | null;
	durations: readonly number[];
	settings?: OpeningDaysSettings;
}): CheckoutWindow | null {
	if (!pickupDate || !requestedDuration || durations.length === 0) return null;
	if (!settings) {
		const returnDate = returnDateForDuration(pickupDate, requestedDuration);
		return returnDate
			? { pickupDate, returnDate, durationDays: requestedDuration }
			: null;
	}
	const durationDays = resolveDuration({
		pickupDate,
		requestedDuration,
		durations,
		settings,
	});
	if (!durationDays) return null;
	const returnDate = returnDateForDuration(pickupDate, durationDays);
	return returnDate ? { pickupDate, returnDate, durationDays } : null;
}

/**
 * Durées que la caisse refuse d'appliquer, et pourquoi.
 *
 * Deux motifs, cumulables :
 *
 * - le magasin est fermé le jour du retour ;
 * - le matériel sélectionné ne vend pas cette durée. Ce motif n'apparaît qu'une
 *   fois un article choisi, la durée étant saisie avant. Griser le bouton vaut
 *   mieux que laisser la caisse dans un cul-de-sac où aucun tarif n'est
 *   sélectionnable ; l'encart « Aucun tarif Nj » du sélecteur de prix reste le
 *   filet si le catalogue change entre deux requêtes.
 *
 * Chaque durée n'est signalée qu'une fois, le motif de fermeture primant : deux
 * raisons sur un même bouton n'en expliqueraient qu'une à l'écran.
 */
export function blockedCheckoutDurations({
	pickupDate,
	durations,
	settings,
	priceOptions,
	minDuration,
}: {
	pickupDate: string | null;
	durations: readonly number[];
	settings?: OpeningDaysSettings;
	/** Options de prix de la variante choisie ; absent tant qu'aucun article ne l'est. */
	priceOptions?: ReadonlyArray<PriceOptionLike>;
	minDuration?: number | null;
}): BlockedDuration[] {
	if (!pickupDate || !settings) return [];
	const closed = closedReturnDurations({ pickupDate, durations, settings });
	if (!priceOptions) return closed;

	const support = productDurationSupport({ priceOptions, minDuration });
	return [
		...closed,
		...unpricedDurations({
			durations,
			support,
			alreadyBlocked: closed.map((block) => block.duration),
		}),
	];
}
