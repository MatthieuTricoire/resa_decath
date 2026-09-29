import {
	addDaysToDateKey,
	dateKeyToUtcNoon,
	formatLongDate,
} from "#/lib/dates";

/**
 * Jours d'ouverture du magasin, seul moyen de savoir si une date peut porter un
 * retrait ou un retour.
 *
 * Le magasin est ouvert du lundi au samedi ; le dimanche est fermé, sauf si
 * l'admin l'ouvre explicitement depuis les réglages (forte saison). C'est le
 * **seul** jour dont l'ouverture varie : tous les autres sont ouverts, sans
 * exception ni horaire (l'application raisonne en journées entières, jamais en
 * heures).
 *
 * Deux bornes seulement sont concernées : le **retrait** et le **retour**. Les
 * jours situés entre les deux n'ont aucune importance — avec le dimanche fermé,
 * une location du samedi au lundi reste parfaitement possible, et c'est le cas
 * d'usage principal du week-end. Le matériel reste chez le client pendant le
 * dimanche, seul le comptoir est fermé.
 *
 * Ce module ne touche pas la base : il reçoit le réglage et répond. C'est la
 * source de vérité partagée par le serveur (`reserveEquipment`), les calendriers
 * publics et l'affichage des horaires.
 */

const SUNDAY = 0;

export type OpeningDaysSettings = {
	/** Ouverture exceptionnelle du dimanche. */
	sundayOpen: boolean;
};

/** Rôle d'une date dans la fenêtre de location, pour un message d'erreur. */
export type WindowEndpoint = "pickup" | "return";

export type ClosedEndpoint = {
	role: WindowEndpoint;
	dateKey: string;
};

/**
 * Jour de la semaine d'une clé `YYYY-MM-DD`, `0` = dimanche.
 *
 * `dateKeyToUtcNoon` renvoie midi UTC, ce qui tombe toujours sur le même jour
 * civil à Paris (UTC+1/+2) : `getUTCDay()` sur cette date est donc le jour vu
 * par le client. `null` si la date n'existe pas.
 */
export function dayOfWeekFromDateKey(dateKey: string): number | null {
	const date = dateKeyToUtcNoon(dateKey);
	return date ? date.getUTCDay() : null;
}

/** Le magasin ouvre-t-il ce jour-là ? Une date invalide est traitée comme fermée. */
export function isOpenDay(
	dateKey: string,
	settings: OpeningDaysSettings,
): boolean {
	const day = dayOfWeekFromDateKey(dateKey);
	if (day === null) return false;
	return day !== SUNDAY || settings.sundayOpen;
}

/** Date de retour produite par une durée, bornes incluses. */
export function returnDateForDuration(
	pickupDate: string,
	durationDays: number,
): string | null {
	if (durationDays < 1) return null;
	return addDaysToDateKey(pickupDate, durationDays - 1);
}

/**
 * Une durée affichée mais non sélectionnable, et la raison de son refus.
 *
 * La raison est toujours rédigée par le code qui refuse, jamais déduite du
 * rendu : le site et la caisse refusent des durées pour des motifs différents
 * (magasin fermé contre matériel non tarifé) et partagent pourtant le même
 * affichage.
 */
export type BlockedDuration = {
	duration: number;
	/** Explication en français, destinée au `title` et aux lecteurs d'écran. */
	reason: string;
};

/**
 * Durées refusées parce que le magasin serait fermé le jour du retour.
 *
 * Complément de `bookableDurations`, qui ne dit que *quelles* durées tiennent.
 * Ici la raison est produite, pour que l'appelant n'ait plus qu'à l'afficher.
 */
export function closedReturnDurations({
	pickupDate,
	durations,
	settings,
}: {
	pickupDate: string;
	durations: readonly number[];
	settings: OpeningDaysSettings;
}): BlockedDuration[] {
	return durations.flatMap((duration) => {
		const returnKey = returnDateForDuration(pickupDate, duration);
		if (!returnKey || isOpenDay(returnKey, settings)) return [];
		return [
			{
				duration,
				reason: `retour le ${formatLongDate(returnKey).toLowerCase()}, magasin fermé`,
			},
		];
	});
}

/** Une durée dont le retour tombe un jour d'ouverture ? */
export function durationIsBookable({
	pickupDate,
	durationDays,
	settings,
}: {
	pickupDate: string;
	durationDays: number;
	settings: OpeningDaysSettings;
}): boolean {
	const returnDate = returnDateForDuration(pickupDate, durationDays);
	if (!returnDate) return false;
	return isOpenDay(pickupDate, settings) && isOpenDay(returnDate, settings);
}

/**
 * Durées réellement proposables pour une date de retrait : celles dont le
 * retour tombe un jour d'ouverture. Les durées écartées ne sont pas interdites,
 * elles sont simplement impossibles à rendre.
 */
export function bookableDurations({
	pickupDate,
	durations,
	settings,
}: {
	pickupDate: string;
	durations: readonly number[];
	settings: OpeningDaysSettings;
}): number[] {
	return durations.filter((duration) =>
		durationIsBookable({ pickupDate, durationDays: duration, settings }),
	);
}

/**
 * Durée à appliquer après un changement de date de retrait.
 *
 * Changer la date de retrait peut invalider la durée courante : vendredi + 2
 * jours finit un dimanche, et depuis le samedi ce dimanche n'accepte plus de
 * retour. Plutôt que de laisser une valeur non sélectionnable dans le store, on
 * conserve la durée demandée si elle fonctionne encore, sinon on se rabat sur la
 * durée valide la plus proche. `null` signifie qu'aucune durée ne convient :
 * l'appelant doit alors laisser la fenêtre vide plutôt que proposer une durée
 * impossible à rendre.
 */
export function resolveDuration({
	pickupDate,
	requestedDuration,
	durations,
	settings,
}: {
	pickupDate: string;
	requestedDuration: number;
	durations: readonly number[];
	settings: OpeningDaysSettings;
}): number | null {
	const candidates = bookableDurations({ pickupDate, durations, settings });
	if (candidates.length === 0) return null;
	if (candidates.includes(requestedDuration)) return requestedDuration;

	// Prolonger plutôt que raccourcir : le client garde au moins les jours
	// qu'il avait demandés, et la durée la plus proche reste intuitive.
	const longer = candidates.filter((duration) => duration > requestedDuration);
	return longer.length > 0 ? longer[0] : candidates[candidates.length - 1];
}

/**
 * Bornes fermées d'une fenêtre : le retrait et le retour, tant qu'ils sont
 * ouverts. Les jours intermédiaires sont volontairement ignorés.
 */
export function closedEndpoints({
	pickupDate,
	returnDate,
	settings,
}: {
	pickupDate: string;
	returnDate: string;
	settings: OpeningDaysSettings;
}): ClosedEndpoint[] {
	const closed: ClosedEndpoint[] = [];
	if (!isOpenDay(pickupDate, settings)) {
		closed.push({ role: "pickup", dateKey: pickupDate });
	}
	if (!isOpenDay(returnDate, settings)) {
		closed.push({ role: "return", dateKey: returnDate });
	}
	return closed;
}

/** Message client pour une borne fermée, le rôle dictant la formulation. */
export function closedEndpointMessage(endpoint: ClosedEndpoint): string {
	const day = formatLongDate(endpoint.dateKey);
	return endpoint.role === "pickup"
		? `Le magasin est fermé le ${day.toLowerCase()} : choisissez une autre date de retrait.`
		: `Le magasin est fermé le ${day.toLowerCase()} : le retour doit tomber un jour d’ouverture, choisissez une autre durée.`;
}
