import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { requireDashboardSession } from "#/features/auth/queries";
import {
	DEFAULT_STORE_HOURS,
	normalizeStoreHours,
	type StoreDaySlot,
	type StoreHours,
} from "#/features/store-hours/types";

/**
 * Cache process des horaires, actif uniquement en production, sur le même
 * modèle que celui des réglages (`settings/queries.ts`) : la page ville et le
 * pied de page relisent ces horaires à chaque rendu, et une lecture par page
 * n'apporte rien. En dev et en test on lit toujours frais, pour qu'un changement
 * de l'admin s'applique immédiatement.
 */
let hoursCache: { value: StoreHours; fetchedAt: number } | null = null;
const HOURS_CACHE_TTL_MS = 5_000;

export function invalidateStoreHoursCache() {
	hoursCache = null;
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function toSlots(row: {
	isOpen: boolean;
	morningFrom: string | null;
	morningTo: string | null;
	afternoonFrom: string | null;
	afternoonTo: string | null;
}): StoreDaySlot[] {
	const slots: StoreDaySlot[] = [];
	if (row.morningFrom && row.morningTo) {
		slots.push({ opens: row.morningFrom, closes: row.morningTo });
	}
	if (row.afternoonFrom && row.afternoonTo) {
		slots.push({ opens: row.afternoonFrom, closes: row.afternoonTo });
	}
	return slots;
}

export const getStoreHoursRecord = createServerOnlyFn(
	async (): Promise<StoreHours> => {
		if (
			process.env.NODE_ENV === "production" &&
			hoursCache &&
			Date.now() - hoursCache.fetchedAt < HOURS_CACHE_TTL_MS
		) {
			return hoursCache.value;
		}

		const rows = await db
			.select({
				day: schema.storeHours.day,
				label: schema.storeHours.label,
				isOpen: schema.storeHours.isOpen,
				morningFrom: schema.storeHours.morningFrom,
				morningTo: schema.storeHours.morningTo,
				afternoonFrom: schema.storeHours.afternoonFrom,
				afternoonTo: schema.storeHours.afternoonTo,
			})
			.from(schema.storeHours);

		// Une base sans ligne n'est pas une semaine fermée : on retombe sur la
		// semaine de référence, qui est aussi le seed. Le site reste donc
		// fonctionnel avant la migration comme après une erreur de saisie.
		const value =
			rows.length === 0
				? DEFAULT_STORE_HOURS
				: normalizeStoreHours(
						rows.map((row) => ({
							day: row.day,
							label: row.label,
							isOpen: row.isOpen,
							slots: toSlots(row),
						})),
					);

		if (process.env.NODE_ENV === "production") {
			hoursCache = { value, fetchedAt: Date.now() };
		}

		return value;
	},
);

export const getStoreHours = createServerFn({ method: "GET" }).handler(
	async (): Promise<StoreHours> => {
		await requireDashboardSession();
		return getStoreHoursRecord();
	},
);

const timeSchema = z
	.string()
	.refine((value) => timePattern.test(value), "Heure attendue au format HH:MM");

/** Un créneau : les deux bornes, ou `null` pour « pas de créneau ». */
const slotInputSchema = z
	.object({
		from: z.union([timeSchema, z.literal("")]),
		to: z.union([timeSchema, z.literal("")]),
	})
	.nullable();

const dayInputSchema = z
	.object({
		day: z.number().int().min(0).max(6),
		label: z.string().trim().min(1).max(20),
		isOpen: z.boolean(),
		morning: slotInputSchema,
		afternoon: slotInputSchema,
	})
	.superRefine((day, ctx) => {
		for (const [name, slot] of [
			["matin", day.morning],
			["après-midi", day.afternoon],
		] as const) {
			if (!slot) continue;
			// Une demi-heure isolée est une saisie interrompue : la refuser vaut
			// mieux qu'un créneau qui s'annonce à 09:00 sans jamais finir.
			if (!slot.from !== !slot.to) {
				ctx.addIssue({
					code: "custom",
					message: `Le créneau du ${name} a une heure de début sans heure de fin`,
					path: [name],
				});
				continue;
			}
			if (slot.from && slot.to && slot.to <= slot.from) {
				ctx.addIssue({
					code: "custom",
					message: `Le créneau du ${name} doit se terminer après son début`,
					path: [name],
				});
			}
		}

		// Un jour déclaré ouvert mais sans aucun créneau n'est publiable nulle
		// part : ni à l'écran, ni en `openingHoursSpecification`. On le refuse à
		// l'écriture plutôt que de le laisser se propager en un magasin annoncé
		// ouvert sans horaires.
		if (day.isOpen && !day.morning && !day.afternoon) {
			ctx.addIssue({
				code: "custom",
				message: "Un jour ouvert doit avoir au moins un créneau horaire",
				path: ["isOpen"],
			});
		}
	});

const updateStoreHoursSchema = z
	.object({ days: z.array(dayInputSchema).length(7) })
	.superRefine((input, ctx) => {
		const seen = new Set<number>();
		for (const day of input.days) {
			if (seen.has(day.day)) {
				ctx.addIssue({
					code: "custom",
					message: `Le jour ${day.day} est saisi deux fois`,
					path: ["days"],
				});
			}
			seen.add(day.day);
		}
	});

export type UpdateStoreHoursInput = z.infer<typeof updateStoreHoursSchema>;

export const updateStoreHours = createServerFn({ method: "POST" })
	.inputValidator(updateStoreHoursSchema.parse)
	.handler(async ({ data }): Promise<StoreHours> => {
		await requireDashboardSession();
		const updatedAt = new Date();

		// Les sept jours sont réécrits dans une transaction : une migration
		// interrompue ne doit pas laisser une semaine sans mercredi, ce que les
		// calendriers liraient comme un magasin fermé ce jour-là.
		await db.transaction(async (tx) => {
			for (const day of data.days) {
				await tx
					.insert(schema.storeHours)
					.values({
						day: day.day,
						label: day.label,
						isOpen: day.isOpen,
						morningFrom: day.morning?.from || null,
						morningTo: day.morning?.to || null,
						afternoonFrom: day.afternoon?.from || null,
						afternoonTo: day.afternoon?.to || null,
						updatedAt,
					})
					.onConflictDoUpdate({
						target: schema.storeHours.day,
						set: {
							label: day.label,
							isOpen: day.isOpen,
							morningFrom: day.morning?.from || null,
							morningTo: day.morning?.to || null,
							afternoonFrom: day.afternoon?.from || null,
							afternoonTo: day.afternoon?.to || null,
							updatedAt,
						},
					});
			}
		});

		invalidateStoreHoursCache();
		return getStoreHoursRecord();
	});
