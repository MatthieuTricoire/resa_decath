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
	minDuration?: number;
	minDurationUnit?: "half_day" | "day";
};

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

	const minimumDuration =
		item.minDuration === undefined
			? 0
			: item.minDuration * (item.minDurationUnit === "day" ? 1 : 0.5);
	if (
		minimumDuration > (getReservationDurationDays(pickupDate, returnDate) ?? 0)
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
