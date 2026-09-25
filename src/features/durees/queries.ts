import { createServerFn } from "@tanstack/react-start";
import { asc, count, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { requireDashboardSession } from "#/features/auth/queries";

export type RentalDurationRow = {
	id: string;
	label: string;
	days: number;
	sortOrder: number;
	usageCount: number;
};

export const getRentalDurations = createServerFn({ method: "GET" }).handler(
	async (): Promise<RentalDurationRow[]> => {
		await requireDashboardSession();
		return db
			.select({
				id: schema.rentalDurations.id,
				label: schema.rentalDurations.label,
				days: schema.rentalDurations.days,
				sortOrder: schema.rentalDurations.sortOrder,
				usageCount: count(schema.priceOptions.id),
			})
			.from(schema.rentalDurations)
			.leftJoin(
				schema.priceOptions,
				eq(schema.priceOptions.duration, schema.rentalDurations.days),
			)
			.groupBy(
				schema.rentalDurations.id,
				schema.rentalDurations.label,
				schema.rentalDurations.days,
				schema.rentalDurations.sortOrder,
			)
			.orderBy(asc(schema.rentalDurations.sortOrder));
	},
);

const durationInputSchema = z.object({
	label: z.string().trim().min(1, "Le libellé est requis"),
	days: z.coerce.number().int().min(1, "La durée doit être d'au moins 1 jour"),
});

export const createRentalDuration = createServerFn({ method: "POST" })
	.inputValidator(durationInputSchema.parse)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		try {
			return await db.transaction(async (tx) => {
				const [{ maxOrder }] = await tx
					.select({ maxOrder: max(schema.rentalDurations.sortOrder) })
					.from(schema.rentalDurations);
				const [created] = await tx
					.insert(schema.rentalDurations)
					.values({
						label: data.label,
						days: data.days,
						sortOrder: (maxOrder ?? 0) + 1,
					})
					.returning();
				return created;
			});
		} catch (err: unknown) {
			const cause = err as { cause?: { code?: string } };
			if (cause?.cause?.code === "23505") {
				throw new Error(`Une durée de ${data.days} jour(s) existe déjà`);
			}
			throw err;
		}
	});

export const updateRentalDuration = createServerFn({ method: "POST" })
	.inputValidator(
		z
			.object({
				id: z.string().min(1),
			})
			.merge(durationInputSchema),
	)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		try {
			await db.transaction(async (tx) => {
				const [existing] = await tx
					.select({ days: schema.rentalDurations.days })
					.from(schema.rentalDurations)
					.where(eq(schema.rentalDurations.id, data.id));
				if (!existing) throw new Error("Durée introuvable");

				if (existing.days !== data.days) {
					const [usage] = await tx
						.select({ value: count(schema.priceOptions.id) })
						.from(schema.priceOptions)
						.where(eq(schema.priceOptions.duration, existing.days));
					if ((usage?.value ?? 0) > 0) {
						throw new Error(
							`Impossible de modifier cette durée : elle est utilisée par ${usage?.value} option(s) de tarif.`,
						);
					}
				}

				await tx
					.update(schema.rentalDurations)
					.set({ label: data.label, days: data.days })
					.where(eq(schema.rentalDurations.id, data.id));
			});
		} catch (err: unknown) {
			const cause = err as { cause?: { code?: string } };
			if (cause?.cause?.code === "23505") {
				throw new Error(`Une durée de ${data.days} jour(s) existe déjà`);
			}
			throw err;
		}
	});

export const deleteRentalDuration = createServerFn({ method: "POST" })
	.inputValidator((id: string) => id)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		await db.transaction(async (tx) => {
			const [duration] = await tx
				.select({ days: schema.rentalDurations.days })
				.from(schema.rentalDurations)
				.where(eq(schema.rentalDurations.id, data));
			if (!duration) throw new Error("Durée introuvable");

			const [usage] = await tx
				.select({ value: count(schema.priceOptions.id) })
				.from(schema.priceOptions)
				.where(eq(schema.priceOptions.duration, duration.days));
			if ((usage?.value ?? 0) > 0) {
				throw new Error(
					`Impossible de supprimer cette durée : elle est utilisée par ${usage?.value} option(s) de tarif.`,
				);
			}

			await tx
				.delete(schema.rentalDurations)
				.where(eq(schema.rentalDurations.id, data));
		});
	});

export const setRentalDurationOrder = createServerFn({ method: "POST" })
	.inputValidator(
		z.array(z.object({ id: z.string().min(1), sortOrder: z.number().int() })),
	)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		await db.transaction(async (tx) => {
			for (const entry of data) {
				await tx
					.update(schema.rentalDurations)
					.set({ sortOrder: entry.sortOrder })
					.where(eq(schema.rentalDurations.id, entry.id));
			}
		});
	});
