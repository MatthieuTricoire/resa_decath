import { todayInParis, toParisDateKey } from "#/lib/dates";
import { classifyScheduleRow } from "./today-schedule";

/**
 * Les champs d'une réservation nécessaires à la classification du retard.
 *
 * Aussi bien la ligne du tableau (`ReservationRow`) que la fiche
 * (`getReservation`) exposent ce contrat : la règle « en retard » n'existe
 * qu'à un seul endroit, et la liste comme la fiche ne peuvent pas diverger sur
 * un jour de décalage.
 */
export type LateInput = {
	status: string;
	pickupDate: string;
	returnDate: string;
};

/**
 * Jour civil (Paris) d'une date de réservation, sous forme de clé `YYYY-MM-DD`.
 *
 * Les comparaisons passent par la clé de Paris plutôt que par `startOfDay` de
 * la machine : la base tourne en GMT, un serveur en UTC, et le comptoir regarde
 * des dates, pas des instants. Une clé se compare comme une chaîne sans
 * arithmétique de dates.
 */
const dayOf = (iso: string) => toParisDateKey(new Date(iso));

/**
 * Le tableau du jour où une réservation appartient — la règle du tableau de
 * bord, portée par `classifyScheduleRow` (retrait dépassé, retour en retard,
 * ou rien). La clé du jour s'injecte pour rester testable comme le classifieur.
 */
export function bucketOf(r: LateInput, todayKey = todayInParis()) {
	return classifyScheduleRow(
		r.status,
		new Date(r.pickupDate),
		new Date(r.returnDate),
		todayKey,
	);
}

export const isLateReturn = (r: LateInput, todayKey = todayInParis()) =>
	bucketOf(r, todayKey) === "lateReturns";

export const isLatePickup = (r: LateInput, todayKey = todayInParis()) =>
	bucketOf(r, todayKey) === "latePickups";

export const isOverdue = (r: LateInput, todayKey = todayInParis()) =>
	isLateReturn(r, todayKey) || isLatePickup(r, todayKey);

/**
 * Le nombre de jours civils écoulés depuis la date en cause (le retour pour un
 * retour en retard, sinon le retrait). La différence se calcule en secondes
 * nominales sur des clés de Paris : une heure d'été ou un changement de fuseau
 * ne change pas le nombre de jours.
 */
export function overdueDays(r: LateInput, todayKey = todayInParis()) {
	const refKey = isLateReturn(r, todayKey)
		? dayOf(r.returnDate)
		: dayOf(r.pickupDate);
	const diff =
		Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${refKey}T00:00:00Z`);
	return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Le libellé du badge « en retard », identique sur la liste et la fiche. Le
 * compteur de jours n'apparaît qu'au-delà du premier jour de retard (un retard
 * d'un jour se lit « en retard », deux jours « en retard · 2 j »).
 */
export function overdueLabel(r: LateInput, todayKey = todayInParis()) {
	const kind = isLateReturn(r, todayKey) ? "Retour" : "Retrait";
	const days = overdueDays(r, todayKey);
	return `${kind} en retard${days > 1 ? ` · ${days} j` : ""}`;
}
