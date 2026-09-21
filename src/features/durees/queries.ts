import { createServerFn } from "@tanstack/react-start";
import { asc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";

export type RentalDurationRow = {
	id: string;
	label: string;
	days: number;
	sortOrder: number;
};

export const getRentalDurations = createServerFn({ method: "GET" }).handler(
	async (): Promise<RentalDurationRow[]> => {
		const rows = await db
			.select({
				id: schema.rentalDurations.id,
				label: schema.rentalDurations.label,
				days: schema.rentalDurations.days,
				sortOrder: schema.rentalDurations.sortOrder,
			})
			.from(schema.rentalDurations)
			.orderBy(asc(schema.rentalDurations.sortOrder));

		return rows;
	},
);

const durationInputSchema = z.object({
	label: z.string().min(1, "Le libellé est requis"),
	days: z.coerce.number().int().min(1, "La durée doit être d'au moins 1 jour"),
});

export const createRentalDuration = createServerFn({ method: "POST" })
	.inputValidator(durationInputSchema.parse)
	.handler(async ({ data }) => {
		const [{ maxOrder }] = await db
			.select({
				maxOrder: max(schema.rentalDurations.sortOrder),
			})
			.from(schema.rentalDurations);

		try {
			const [created] = await db
				.insert(schema.rentalDurations)
				.values({
					label: data.label,
					days: data.days,
					sortOrder: (maxOrder ?? 0) + 1,
				})
				.returning();
			return created;
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
		try {
			await db
				.update(schema.rentalDurations)
				.set({ label: data.label, days: data.days })
				.where(eq(schema.rentalDurations.id, data.id));
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
		await db
			.delete(schema.rentalDurations)
			.where(eq(schema.rentalDurations.id, data));
	});

export const setRentalDurationOrder = createServerFn({ method: "POST" })
	.inputValidator(
		z.array(z.object({ id: z.string().min(1), sortOrder: z.number().int() })),
	)
	.handler(async ({ data }) => {
		for (const entry of data) {
			await db
				.update(schema.rentalDurations)
				.set({ sortOrder: entry.sortOrder })
				.where(eq(schema.rentalDurations.id, entry.id));
		}
	});
