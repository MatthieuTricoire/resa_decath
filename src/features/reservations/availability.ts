export type RentalSeason = "winter" | "summer" | "all";
export type SeasonOverride = "auto" | Exclude<RentalSeason, "all">;
export type RentalAvailabilitySettings = {
	seasonalFilteringEnabled: boolean;
	isRentalOpen: boolean;
	seasonOverride: SeasonOverride;
	summerFrom: string | null;
	summerTo: string | null;
	winterFrom: string | null;
	winterTo: string | null;
};

export type AvailabilityItem = {
	season: RentalSeason;
	availableFrom: string | null;
	availableTo: string | null;
	status?: string;
	/** Durée minimale de location, en journées entières. */
	minDuration?: number;
};

/**
 * Durée minimale exigée par l'article, en journées.
 *
 * La location se fait en journées entières : une durée de 2 jours minimum
 * refuse une journée, une durée de 1 jour minimum accepte tout.
 */
export function minimumRentalDays(minDuration?: number | null): number {
	if (minDuration === undefined || minDuration === null) return 0;
	return Number.isFinite(minDuration) ? minDuration : 0;
}

/**
 * Statuts de réservation qui immobilisent du matériel. Toute autre source de
 * stock : ces réservations se chevauchent sur la fenêtre demandée, les
 * Exemplaires sont donc déjà sortis ou réservés.
 */
export const STOCK_CONSUMING_STATUSES = [
	"PENDING_VERIFICATION",
	"CONFIRMED",
	"COLLECTED",
] as const;

/** Exemplaires encore réservables une fois les réservations actives déduites. */
export function availableQuantity(
	totalStock: number | null | undefined,
	reservedQuantity: number | null | undefined,
): number {
	const total = Math.max(0, Number(totalStock ?? 0));
	const reserved = Math.max(0, Number(reservedQuantity ?? 0));
	return Math.max(0, total - reserved);
}

/** `true` si la ligne de commande dépasse ce qu'il reste pour la fenêtre. */
export function stockShortage(
	quantity: number,
	available: number | null | undefined,
): boolean {
	return quantity > Math.max(0, Number(available ?? 0));
}

/**
 * Raison pour laquelle une ligne du panier ne peut pas être réservée, ou `null`
 * si elle est reservable. Deux causes distinctes : le devis serveur la refuse
 * (matériel retiré, hors saison, durée non tarifée), ou bien la ligne dépasse le
 * stock restant, ce qui est Visible côté client mais n'apparaît dans aucun prix.
 */
export function cartLineBlocker(line: {
	status: string;
	message: string | null;
	quantity: number;
	availableQuantity: number;
}): string | null {
	if (line.status !== "available") {
		return line.message ?? "Ce matériel n’est pas louable pour ces dates.";
	}
	if (!stockShortage(line.quantity, line.availableQuantity)) return null;
	const left = Math.max(0, line.availableQuantity);
	if (left === 0) {
		return "Tous les exemplaires sont réservés ou loués pour ces dates.";
	}
	const noun = `${left} exemplaire${left > 1 ? "s" : ""}`;
	return `Stock insuffisant : ${noun} disponible${left > 1 ? "s" : ""} pour ces dates.`;
}

export type AvailabilityResult = {
	available: boolean;
	reason:
		| "rentals_closed"
		| "variant_unavailable"
		| "outside_item_period"
		| "below_minimum_duration"
		| "season_not_configured"
		| "outside_active_season"
		| null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SEASON_DAYS = 366;
const parisDateFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Europe/Paris",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

function toDateKey(date: Date): string {
	const parts = parisDateFormatter.formatToParts(date);
	const year = parts.find((part) => part.type === "year")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	const day = parts.find((part) => part.type === "day")?.value;
	return `${year}-${month}-${day}`;
}

function parseDateKey(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const [, year, month, day] = match;
	const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
	if (toUTCDateKey(date) !== value) return null;
	return date;
}

function toUTCDateKey(date: Date): string {
	return [
		date.getUTCFullYear().toString().padStart(4, "0"),
		(date.getUTCMonth() + 1).toString().padStart(2, "0"),
		date.getUTCDate().toString().padStart(2, "0"),
	].join("-");
}

function getDateKeys(pickupDate: Date, returnDate: Date): string[] | null {
	if (
		Number.isNaN(pickupDate.getTime()) ||
		Number.isNaN(returnDate.getTime()) ||
		returnDate.getTime() < pickupDate.getTime()
	) {
		return null;
	}

	const pickup = parseDateKey(toDateKey(pickupDate));
	const returned = parseDateKey(toDateKey(returnDate));
	if (!pickup || !returned) return null;

	const days: string[] = [];
	for (
		let timestamp = pickup.getTime();
		timestamp <= returned.getTime();
		timestamp += DAY_MS
	) {
		days.push(toUTCDateKey(new Date(timestamp)));
	}
	if (days.length > MAX_SEASON_DAYS) return null;
	return days;
}

export function getReservationDurationDays(
	pickupDate: Date,
	returnDate: Date,
): number | null {
	return getDateKeys(pickupDate, returnDate)?.length ?? null;
}

function isValidMonthDay(value: string | null | undefined): value is string {
	if (!value || !/^\d{2}-\d{2}$/.test(value)) return false;
	const [month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(2000, month - 1, day));
	return (
		date.getUTCFullYear() === 2000 &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

function isDayWithinPeriod(dateKey: string, from: string, to: string): boolean {
	const monthDay = dateKey.slice(5);
	if (from === to) return monthDay === from;
	return from <= to
		? monthDay >= from && monthDay <= to
		: monthDay >= from || monthDay <= to;
}

function isDayWithinBounds(
	dateKey: string,
	from: string | null,
	to: string | null,
): boolean {
	if (!from && !to) return true;
	if (isValidMonthDay(from) && isValidMonthDay(to)) {
		return isDayWithinPeriod(dateKey, from, to);
	}
	const monthDay = dateKey.slice(5);
	if (isValidMonthDay(from)) return monthDay >= from;
	if (isValidMonthDay(to)) return monthDay <= to;
	return true;
}

function isDateRangeWithinBounds(
	dateKeys: string[],
	from: string | null,
	to: string | null,
): boolean {
	if ((!from && !to) || dateKeys.length === 0) return true;
	if (dateKeys.length > MAX_SEASON_DAYS) return false;
	return dateKeys.every((dateKey) => isDayWithinBounds(dateKey, from, to));
}

export function getActiveSeasonsForRange(
	pickupDate: Date,
	returnDate: Date,
	settings: RentalAvailabilitySettings,
): { seasons: Exclude<RentalSeason, "all">[]; wholeRangeAvailable: boolean } {
	if (settings.seasonOverride !== "auto") {
		return { seasons: [settings.seasonOverride], wholeRangeAvailable: true };
	}

	const periods: Array<{
		season: Exclude<RentalSeason, "all">;
		from: string | null;
		to: string | null;
	}> = [
		{ season: "summer", from: settings.summerFrom, to: settings.summerTo },
		{ season: "winter", from: settings.winterFrom, to: settings.winterTo },
	];
	const configuredPeriods = periods.flatMap((period) =>
		isValidMonthDay(period.from) && isValidMonthDay(period.to)
			? [{ ...period, from: period.from, to: period.to }]
			: [],
	);
	const dateKeys = getDateKeys(pickupDate, returnDate);
	if (configuredPeriods.length === 0 || !dateKeys) {
		return { seasons: [], wholeRangeAvailable: false };
	}
	if (dateKeys.length > MAX_SEASON_DAYS) {
		return { seasons: [], wholeRangeAvailable: false };
	}

	const seasons = new Set<Exclude<RentalSeason, "all">>();
	let wholeRangeAvailable = true;
	for (const dateKey of dateKeys) {
		let hasActiveSeason = false;
		for (const period of configuredPeriods) {
			if (isDayWithinPeriod(dateKey, period.from, period.to)) {
				seasons.add(period.season);
				hasActiveSeason = true;
			}
		}
		if (!hasActiveSeason) wholeRangeAvailable = false;
	}

	return { seasons: [...seasons], wholeRangeAvailable };
}

export type SeasonalAvailability =
	| "available"
	| "out_of_season"
	| "not_configured"
	| "not_filtered";

export function getSeasonalAvailability(
	item: Pick<AvailabilityItem, "season">,
	settings: RentalAvailabilitySettings,
	date = new Date(),
): SeasonalAvailability {
	if (!settings.seasonalFilteringEnabled) return "not_filtered";
	if (item.season === "all") return "available";

	if (settings.seasonOverride === "auto") {
		const hasConfiguredSeason =
			(isValidMonthDay(settings.summerFrom) &&
				isValidMonthDay(settings.summerTo)) ||
			(isValidMonthDay(settings.winterFrom) &&
				isValidMonthDay(settings.winterTo));
		if (!hasConfiguredSeason) return "not_configured";
	}

	const active = getActiveSeasonsForRange(date, date, settings);
	if (!active.wholeRangeAvailable) return "out_of_season";
	return active.seasons.includes(item.season) ? "available" : "out_of_season";
}

/**
 * L'article est-il catégoriquement à contretemps pour la date donnée ?
 *
 * Sert à masquer une catégorie ou un produit du catalogue public hors saison.
 * Contrairement à `getSeasonalAvailability`, il ne répond « oui » que devant un
 * verdict certain : filtrage absent (`not_filtered`) ou plages non configurées
 * (`not_configured`) ne masquent **rien** — un catalogue basculé dans le noir
 * parce que l'admin n'a pas saisi ses dates serait pire qu'un matériel visible.
 */
export function isItemOutOfSeason(
	item: Pick<AvailabilityItem, "season">,
	settings: RentalAvailabilitySettings,
	date?: Date,
): boolean {
	return getSeasonalAvailability(item, settings, date) === "out_of_season";
}

export function evaluateItemAvailability({
	item,
	settings,
	pickupDate,
	returnDate,
}: {
	item: AvailabilityItem;
	settings: RentalAvailabilitySettings;
	pickupDate: Date;
	returnDate: Date;
}): AvailabilityResult {
	if (!settings.isRentalOpen) {
		return { available: false, reason: "rentals_closed" };
	}
	if (item.status && item.status !== "AVAILABLE") {
		return { available: false, reason: "variant_unavailable" };
	}

	const dateKeys = getDateKeys(pickupDate, returnDate);
	if (
		!dateKeys ||
		!isDateRangeWithinBounds(dateKeys, item.availableFrom, item.availableTo)
	) {
		return { available: false, reason: "outside_item_period" };
	}

	if (
		minimumRentalDays(item.minDuration) >
		(getReservationDurationDays(pickupDate, returnDate) ?? 0)
	) {
		return { available: false, reason: "below_minimum_duration" };
	}

	if (!settings.seasonalFilteringEnabled || item.season === "all") {
		return { available: true, reason: null };
	}

	const active = getActiveSeasonsForRange(pickupDate, returnDate, settings);
	if (settings.seasonOverride === "auto") {
		const isConfigured =
			(isValidMonthDay(settings.summerFrom) &&
				isValidMonthDay(settings.summerTo)) ||
			(isValidMonthDay(settings.winterFrom) &&
				isValidMonthDay(settings.winterTo));
		if (!isConfigured) {
			return { available: false, reason: "season_not_configured" };
		}
	}

	if (!active.wholeRangeAvailable || !active.seasons.includes(item.season)) {
		return { available: false, reason: "outside_active_season" };
	}

	return { available: true, reason: null };
}
