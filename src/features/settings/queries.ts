import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { requireDashboardSession } from "#/features/auth/queries";

export type RentalSettings = {
	seasonalFilteringEnabled: boolean;
	isRentalOpen: boolean;
	seasonOverride: "auto" | "summer" | "winter";
	summerFrom: string | null;
	summerTo: string | null;
	winterFrom: string | null;
	winterTo: string | null;
	updatedAt: string;
};

export const DEFAULT_RENTAL_SETTINGS: RentalSettings = {
	seasonalFilteringEnabled: false,
	isRentalOpen: true,
	seasonOverride: "auto",
	summerFrom: null,
	summerTo: null,
	winterFrom: null,
	winterTo: null,
	updatedAt: "",
};

export const getRentalSettingsRecord = createServerOnlyFn(
	async (): Promise<RentalSettings> => {
		const [row] = await db
			.select()
			.from(schema.rentalSettings)
			.where(eq(schema.rentalSettings.id, 1))
			.limit(1);

		if (!row) return DEFAULT_RENTAL_SETTINGS;

		return {
			...row,
			updatedAt: row.updatedAt.toISOString(),
		};
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
					seasonOverride: data.seasonOverride,
					summerFrom: data.summerFrom || null,
					summerTo: data.summerTo || null,
					winterFrom: data.winterFrom || null,
					winterTo: data.winterTo || null,
					updatedAt,
				},
			})
			.returning();

		return {
			...row,
			updatedAt: row.updatedAt.toISOString(),
		};
	});
