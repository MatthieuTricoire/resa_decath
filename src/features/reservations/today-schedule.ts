import { toParisDateKey } from "#/lib/dates";

/** Lequel des quatre tableaux du jour une réservation appartient. */
export type ScheduleBucket =
	| "pickups"
	| "returns"
	| "latePickups"
	| "lateReturns";

/**
 * Classe une réservation dans le tableau du jour où elle apparaît.
 *
 * Fonction pure, volontairement séparée de la requête : c'est ici que se
 * concentrent les règles que l'on veut pouvoir tester, et elles sont dictées par
 * l'état du cycle de vie plutôt que par une requête.
 *
 * Les dates sont comparées en clés `YYYY-MM-DD` de Paris, jamais en
 * millisecondes : deux dates à des heures différentes mais sur le même jour
 * civil sont le même jour. Une réservation est datée, pas minutée, et l'afficher
 * à l'heure exacte du stockage donnerait « 02:00 » pour une saisie au comptoir
 * et « 14:00 » pour une saisie en ligne du même jour.
 *
 * - `CONFIRMED` et un jour de retrait déjà passé : le client ne s'est pas
 *   présenté et le matériel n'est pas sorti. C'est le tableau des **retraits
 *   dépassés** — ce que le comptoir doit libérer. La comparaison se fait sur la
 *   date *civile* : un retrait prévu aujourd'hui reste attendu même à 23 h.
 * - `CONFIRMED` et un retrait aujourd'hui : à récupérer.
 * - `CONFIRMED` et un retrait futur : hors du tableau du jour.
 * - `COLLECTED` et une date de retour déjà passée : retour en retard.
 * - `COLLECTED` et un retour aujourd'hui ou plus tard : à rendre aujourd'hui.
 *
 * Une réservation retirée (`RETURNED`) ou annulée (`CANCELLED`) n'a plus rien à
 * faire au comptoir aujourd'hui : `null`.
 */
export function classifyScheduleRow(
	status: string,
	pickupDate: Date,
	returnDate: Date,
	todayKey: string,
): ScheduleBucket | null {
	const pickupKey = toParisDateKey(pickupDate);

	if (status === "CONFIRMED") {
		if (pickupKey > todayKey) return null;
		return pickupKey < todayKey ? "latePickups" : "pickups";
	}

	if (status === "COLLECTED") {
		return toParisDateKey(returnDate) < todayKey ? "lateReturns" : "returns";
	}

	return null;
}
