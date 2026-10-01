/**
 * Utilitaires de dates partagés entre le backoffice et le parcours public.
 *
 * Le site public ne propose que des **dates** (jour de retrait, jour de
 * retour), pas des heures. On les convertit en `Date` à midi UTC : Paris
 * étant en UTC+1/+2, la clé de date Europe/Paris correspondante est le même
 * jour, et un retrait/retour le même jour compte pour une journée.
 */

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const parisDateFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Europe/Paris",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

/** Convertit une date UTC en clé `YYYY-MM-DD` vue depuis Paris. */
export function toParisDateKey(date: Date): string {
	const parts = parisDateFormatter.formatToParts(date);
	const year = parts.find((part) => part.type === "year")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	const day = parts.find((part) => part.type === "day")?.value;
	return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD` → Date à midi UTC, `null` si la date n'existe pas. */
export function dateKeyToUtcNoon(value: string): Date | null {
	const match = DATE_KEY_PATTERN.exec(value);
	if (!match) return null;
	const [, year, month, day] = match;
	const date = new Date(
		Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0),
	);
	if (toParisDateKey(date) !== value) return null;
	return date;
}

export function isValidDateKey(value: string): boolean {
	return dateKeyToUtcNoon(value) !== null;
}

/** Aujourd'hui à Paris, au format `YYYY-MM-DD`. */
export function todayInParis(): string {
	return toParisDateKey(new Date());
}

/**
 * Dernière heure pour un retrait le jour même, utilisée quand la base n'a pas
 * encore de valeur : après, le site public refuse une location qui démarre
 * aujourd'hui. La caisse backoffice garde la main, seul le parcours public est
 * concerné.
 *
 * La valeur effective vit dans `rental_settings.last_same_day_pickup_hour` et
 * reste modifiable depuis les Réglages. Cette constante n'est plus qu'un
 * repli : aucun appelant ne doit s'y fier pour une règle métier.
 */
export const DEFAULT_LAST_SAME_DAY_PICKUP_HOUR = 15;

/**
 * Est-il plus de `cutoffHour` à Paris ? L'heure est lue dans le fuseau
 * « Europe/Paris », jamais celui de la machine qui exécute le code.
 */
export function isPastSameDayPickupCutoffInParis(
	cutoffHour: number,
	now: Date = new Date(),
): boolean {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: "Europe/Paris",
		hour: "2-digit",
		hourCycle: "h23",
	}).formatToParts(now);
	const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
	return hour >= clampCutoffHour(cutoffHour);
}

/** Une heure de coupure hors bornes rendrait la règle illisible : on la borne. */
export function clampCutoffHour(hour: number): number {
	if (!Number.isFinite(hour)) return DEFAULT_LAST_SAME_DAY_PICKUP_HOUR;
	return Math.min(23, Math.max(0, Math.round(hour)));
}

/**
 * Date de retrait la plus proche autorisée côté public : aujourd'hui avant la
 * coupure, sinon demain. Chaque appelant du parcours public s'en sert comme
 * borne basse, pour que le calendrier et la sauvegarde de panier appliquent la
 * même règle que le serveur.
 */
export function earliestPickupDateInParis(
	cutoffHour: number,
	now: Date = new Date(),
): string {
	const today = toParisDateKey(now);
	if (!isPastSameDayPickupCutoffInParis(cutoffHour, now)) return today;
	return addDaysToDateKey(today, 1) ?? today;
}

export function addDaysToDateKey(value: string, days: number): string | null {
	const date = dateKeyToUtcNoon(value);
	if (!date) return null;
	date.setUTCDate(date.getUTCDate() + days);
	return toParisDateKey(date);
}

export function compareDateKeys(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

/** Nombre de jours calendaires demandés, bornes incluses. */
export function countRentalDays(pickupKey: string, returnKey: string): number {
	const pickup = dateKeyToUtcNoon(pickupKey);
	const returned = dateKeyToUtcNoon(returnKey);
	if (!pickup || !returned) return 0;
	const dayMs = 24 * 60 * 60 * 1000;
	const days = Math.round((returned.getTime() - pickup.getTime()) / dayMs) + 1;
	return days > 0 ? days : 0;
}

/** « 1 jour », « 3 jours »… utilisé dans les libellés de panier et d'email. */
export function rentalDurationLabel(days: number): string {
	return `${days} jour${days > 1 ? "s" : ""}`;
}

const longDateFormatter = new Intl.DateTimeFormat("fr-FR", {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "Europe/Paris",
});

/** « vendredi 10 avril 2026 » à partir d'une clé `YYYY-MM-DD`. */
export function formatLongDate(value: string): string {
	const date = dateKeyToUtcNoon(value);
	if (!date) return value;
	const formatted = longDateFormatter.format(date);
	return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
	day: "numeric",
	timeZone: "Europe/Paris",
});

const dayMonthFormatter = new Intl.DateTimeFormat("fr-FR", {
	day: "numeric",
	month: "long",
	timeZone: "Europe/Paris",
});

const yearFormatter = new Intl.DateTimeFormat("en-CA", {
	year: "numeric",
	timeZone: "Europe/Paris",
});

/**
 * Libellé compact d'une fenêtre de location : le mois et l'année ne sont écrits
 * qu'une fois quand les deux dates les partagent, soit « 12 → 15 avril 2026 » ou
 * « 28 avril → 3 mai 2026 ». Retourne une chaîne vide si le retrait est absent.
 */
export function formatRentalWindow(fromKey: string, toKey: string): string {
	const from = dateKeyToUtcNoon(fromKey);
	if (!from) return "";
	const fromDay = dayMonthFormatter.format(from);
	if (!toKey || toKey === fromKey)
		return `${fromDay} ${yearFormatter.format(from)}`;
	const to = dateKeyToUtcNoon(toKey);
	if (!to) return `${fromDay} ${yearFormatter.format(from)}`;
	// Même mois : « 12 → 15 avril 2026 ».
	if (fromKey.slice(0, 7) === toKey.slice(0, 7)) {
		return `${dayFormatter.format(from)} → ${dayMonthFormatter.format(to)} ${yearFormatter.format(to)}`;
	}
	return `${fromDay} → ${dayMonthFormatter.format(to)} ${yearFormatter.format(to)}`;
}

/**
 * Fenêtre de location convertie en `Date` pour les calendriers
 * (`react-day-picker`). Les dates sont à midi UTC, cf. le module.
 */
export function dateKeyRangeToDates(
	fromKey: string,
	toKey: string,
): { from: Date; to?: Date } | undefined {
	const from = dateKeyToUtcNoon(fromKey);
	if (!from) return undefined;
	const to = dateKeyToUtcNoon(toKey);
	return to ? { from, to } : { from };
}

/** Inverse de `dateKeyRangeToDates` : des `Date` vers des clés de dates. */
export function dateKeyRangeFromDates(range: {
	from?: Date | undefined;
	to?: Date | undefined;
}): { from: string; to: string } {
	return {
		from: range.from ? toParisDateKey(range.from) : "",
		to: range.to ? toParisDateKey(range.to) : "",
	};
}
