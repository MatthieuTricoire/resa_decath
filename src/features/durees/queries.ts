import { createServerFn } from "@tanstack/react-start";
import { and, asc, count, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { requireDashboardSession } from "#/features/auth/queries";
import { partitionPriceOptions } from "#/features/durees/partition";

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
		return (
			db
				.select({
					id: schema.rentalDurations.id,
					label: schema.rentalDurations.label,
					days: schema.rentalDurations.days,
					sortOrder: schema.rentalDurations.sortOrder,
					usageCount: count(schema.priceOptions.id),
				})
				.from(schema.rentalDurations)
				// Seules les options encore en vente comptent : une option archivée ne
				// dit rien de l'usage réel de la durée, et afficherait « N tarifs » à
				// vie sur un tarif qu'on ne vend plus.
				.leftJoin(
					schema.priceOptions,
					and(
						eq(schema.priceOptions.duration, schema.rentalDurations.days),
						eq(schema.priceOptions.isActive, true),
					),
				)
				.groupBy(
					schema.rentalDurations.id,
					schema.rentalDurations.label,
					schema.rentalDurations.days,
					schema.rentalDurations.sortOrder,
				)
				.orderBy(asc(schema.rentalDurations.sortOrder))
		);
	},
);

const durationInputSchema = z.object({
	label: z.string().trim().min(1, "Le libellé est requis"),
	days: z.coerce.number().int().min(1, "La durée doit être d'au moins 1 jour"),
});

export const createRentalDuration = createServerFn({ method: "POST" })
	.validator(durationInputSchema.parse)
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
	.validator(
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
					// Seules les options en vente comptent : une option archivée ne
					// dépend plus de cette durée pour être vendue.
					const [usage] = await tx
						.select({ value: count(schema.priceOptions.id) })
						.from(schema.priceOptions)
						.where(
							and(
								eq(schema.priceOptions.duration, existing.days),
								eq(schema.priceOptions.isActive, true),
							),
						);
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
	.validator((id: string) => id)
	.handler(async ({ data }): Promise<{ removed: number; archived: number }> => {
		await requireDashboardSession();
		return db.transaction(async (tx) => {
			const [duration] = await tx
				.select({ days: schema.rentalDurations.days })
				.from(schema.rentalDurations)
				.where(eq(schema.rentalDurations.id, data));
			if (!duration) throw new Error("Durée introuvable");

			// `price_options.duration` n'a pas de clé étrangère vers cette table :
			// rien ne bloque la suppression en base. Ce sont les options qui
			// portent la durée qu'il faut traiter, une fois pour toutes, avant de
			// retirer la référence.
			const options = await tx
				.select({ id: schema.priceOptions.id })
				.from(schema.priceOptions)
				.where(eq(schema.priceOptions.duration, duration.days));
			const optionIds = options.map((option) => option.id);

			// `reservation_items.priceOptionId` est la seule clé étrangère qui
			// pointe ici : une option facturée est un fait historique qu'on ne
			// détruit pas, on la rend seulement non vendable.
			const referenced = optionIds.length
				? await tx
						.select({ id: schema.reservationItems.priceOptionId })
						.from(schema.reservationItems)
						.where(inArray(schema.reservationItems.priceOptionId, optionIds))
				: [];

			const { toDelete, toArchive } = partitionPriceOptions({
				optionIds,
				referencedIds: referenced.flatMap((row) => (row.id ? [row.id] : [])),
			});

			if (toDelete.length > 0) {
				await tx
					.delete(schema.priceOptions)
					.where(inArray(schema.priceOptions.id, toDelete));
			}
			if (toArchive.length > 0) {
				await tx
					.update(schema.priceOptions)
					.set({ isActive: false })
					.where(inArray(schema.priceOptions.id, toArchive));
			}

			await tx
				.delete(schema.rentalDurations)
				.where(eq(schema.rentalDurations.id, data));

			return { removed: toDelete.length, archived: toArchive.length };
		});
	});

export const setRentalDurationOrder = createServerFn({ method: "POST" })
	.validator(
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
