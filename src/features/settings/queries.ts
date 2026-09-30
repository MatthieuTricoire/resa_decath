import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { requireDashboardSession } from "#/features/auth/queries";

export type RentalSettings = {
	seasonalFilteringEnabled: boolean;
	isRentalOpen: boolean;
	/** Ouverture du dimanche, pour les retraits et retours de ce jour-là. */
	sundayOpen: boolean;
	seasonOverride: "auto" | "summer" | "winter";
	summerFrom: string | null;
	summerTo: string | null;
	winterFrom: string | null;
	winterTo: string | null;
	updatedAt: string;
};

export const DEFAULT_RENTAL_SETTINGS: RentalSettings = {
	seasonalFilteringEnabled: true,
	isRentalOpen: true,
	sundayOpen: false,
	seasonOverride: "auto",
	summerFrom: null,
	summerTo: null,
	winterFrom: null,
	winterTo: null,
	updatedAt: "",
};

/**
 * Cache process des réglages, actif uniquement en production (un seul process
 * derrière Vercel/Coolify). `rental_settings` est relu par chaque page du
 * catalogue public : sans cache, ~3 lectures par chargement d'accueil. En dev
 * et en test on lit toujours frais pour que les changements soient immédiats.
 */
let settingsCache: { value: RentalSettings; fetchedAt: number } | null = null;
const SETTINGS_CACHE_TTL_MS = 5_000;

export function invalidateRentalSettingsCache() {
	settingsCache = null;
}

export const getRentalSettingsRecord = createServerOnlyFn(
	async (): Promise<RentalSettings> => {
		if (
			process.env.NODE_ENV === "production" &&
			settingsCache &&
			Date.now() - settingsCache.fetchedAt < SETTINGS_CACHE_TTL_MS
		) {
			return settingsCache.value;
		}

		const [row] = await db
			.select()
			.from(schema.rentalSettings)
			.where(eq(schema.rentalSettings.id, 1))
			.limit(1);

		if (!row) return DEFAULT_RENTAL_SETTINGS;

		const value: RentalSettings = {
			...row,
			updatedAt: row.updatedAt.toISOString(),
		};

		if (process.env.NODE_ENV === "production") {
			settingsCache = { value, fetchedAt: Date.now() };
		}

		return value;
	},
);

export const getRentalSettings = createServerFn({ method: "GET" }).handler(
	async (): Promise<RentalSettings> => {
		await requireDashboardSession();
		return getRentalSettingsRecord();
	},
);

const monthDaySchema = z.string().refine((value) => {
	if (value === "") return true;
	const [month, day] = value.split("-").map(Number);
	if (month === undefined || day === undefined) return false;
	const date = new Date(Date.UTC(2000, month - 1, day));
	return (
		date.getUTCFullYear() === 2000 &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}, "La date doit être au format MM-JJ");

const updateRentalSettingsSchema = z.object({
	seasonalFilteringEnabled: z.boolean(),
	isRentalOpen: z.boolean(),
	sundayOpen: z.boolean(),
	seasonOverride: z.enum(["auto", "summer", "winter"]),
	summerFrom: monthDaySchema.default(""),
	summerTo: monthDaySchema.default(""),
	winterFrom: monthDaySchema.default(""),
	winterTo: monthDaySchema.default(""),
});

export type UpdateRentalSettingsInput = z.infer<
	typeof updateRentalSettingsSchema
>;

export const updateRentalSettings = createServerFn({ method: "POST" })
	.inputValidator(updateRentalSettingsSchema.parse)
	.handler(async ({ data }): Promise<RentalSettings> => {
		await requireDashboardSession();
		const updatedAt = new Date();
		const [row] = await db
			.insert(schema.rentalSettings)
			.values({
				id: 1,
				seasonalFilteringEnabled: data.seasonalFilteringEnabled,
				isRentalOpen: data.isRentalOpen,
				sundayOpen: data.sundayOpen,
				seasonOverride: data.seasonOverride,
				summerFrom: data.summerFrom || null,
				summerTo: data.summerTo || null,
				winterFrom: data.winterFrom || null,
				winterTo: data.winterTo || null,
				updatedAt,
			})
			.onConflictDoUpdate({
				target: schema.rentalSettings.id,
				set: {
					seasonalFilteringEnabled: data.seasonalFilteringEnabled,
					isRentalOpen: data.isRentalOpen,
					sundayOpen: data.sundayOpen,
					seasonOverride: data.seasonOverride,
					summerFrom: data.summerFrom || null,
					summerTo: data.summerTo || null,
					winterFrom: data.winterFrom || null,
					winterTo: data.winterTo || null,
					updatedAt,
				},
			})
			.returning();

		invalidateRentalSettingsCache();

		return {
			...row,
			updatedAt: row.updatedAt.toISOString(),
		};
	});
