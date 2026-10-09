import { createServerFn } from "@tanstack/react-start";
import {
	and,
	asc,
	desc,
	eq,
	ilike,
	inArray,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { requireDashboardSession } from "#/features/auth/queries";

export type UserRow = {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	loyaltyCard: string | null;
	/**
	 * Nombre de non-présentations de ce client (réservations `is_no_show = 1`).
	 * C'est le « blame » : un client qui réserve puis ne vient jamais, signal
	 * à regarder avant d'accepter une nouvelle réservation.
	 */
	noShowCount: number;
	createdAt: string;
	updatedAt: string;
};

export type UserReservationRow = {
	id: string;
	status: string;
	pickupDate: string;
	returnDate: string;
	totalPrice: string;
	createdAt: string;
	/**
	 * Non-présentation constatée (1) ou non (0). Le drapeau vit sur la
	 * réservation, mais c'est sur la fiche client qu'il prend tout son sens :
	 * c'est là qu'on repère un client qui enchaîne les commandes jamais venues.
	 */
	isNoShow: number;
	items: Array<{
		id: string;
		itemName: string;
		brand: string;
		quantity: number;
		unitPrice: string;
	}>;
};

export const getUsers = createServerFn({ method: "GET" })
	.validator(
		z.object({
			search: z.string().optional(),
		}),
	)
	.handler(async ({ data }): Promise<UserRow[]> => {
		await requireDashboardSession();
		const conditions: SQL[] = [];

		if (data.search) {
			const q = `%${data.search}%`;
			const condition = or(
				ilike(schema.user.name, q),
				ilike(schema.user.email, q),
				ilike(schema.user.phone ?? "", q),
			);
			if (condition) conditions.push(condition);
		}

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		// Comptage des non-présentations en deux passes : pas de sous-requête
		// corrélée dans le select — Drizzle retire le qualificatif des colonnes
		// imbriquées (`where "user_id" = "id"`), ce qui cassait la corrélation
		// et produisait une erreur `text = uuid`. L'agrégat par utilisateur se
		// calcule en une passe, puis on fusionne par Map, sans toucher au tri.
		const [blameCounts, rows] = await Promise.all([
			db
				.select({
					userId: schema.reservations.userId,
					count: sql<number>`count(*)::int`,
				})
				.from(schema.reservations)
				.where(eq(schema.reservations.isNoShow, 1))
				.groupBy(schema.reservations.userId),
			db
				.select({
					id: schema.user.id,
					name: schema.user.name,
					email: schema.user.email,
					phone: schema.user.phone,
					loyaltyCard: schema.user.loyaltyCard,
					createdAt: schema.user.createdAt,
					updatedAt: schema.user.updatedAt,
				})
				.from(schema.user)
				.where(where)
				.orderBy(asc(schema.user.name)),
		]);

		const blame = new Map(blameCounts.map((r) => [r.userId, r.count]));

		return rows.map((r) => ({
			...r,
			noShowCount: blame.get(r.id) ?? 0,
			createdAt: r.createdAt.toISOString(),
			updatedAt: r.updatedAt.toISOString(),
		}));
	});

const createUserSchema = z.object({
	name: z.string().min(1, "Le nom est requis"),
	email: z.string().email("Email invalide"),
	phone: z.string().min(1, "Le téléphone est requis"),
	loyaltyCard: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const createUser = createServerFn({ method: "POST" })
	.validator(createUserSchema.parse)
	.handler(async ({ data }): Promise<{ id: string }> => {
		await requireDashboardSession();
		const existing = await db
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(eq(schema.user.email, data.email));

		if (existing.length > 0) {
			throw new Error("Un client avec cet email existe déjà");
		}

		const id = crypto.randomUUID();
		const now = new Date();

		await db.insert(schema.user).values({
			id,
			name: data.name,
			email: data.email,
			phone: data.phone,
			loyaltyCard: data.loyaltyCard ?? null,
			emailVerified: false,
			role: "user",
			image: null,
			createdAt: now,
			updatedAt: now,
		});

		return { id };
	});

export const getUserDetail = createServerFn({ method: "GET" })
	.validator((userId: string) => userId)
	.handler(async ({ data }): Promise<UserRow | null> => {
		await requireDashboardSession();
		const [row] = await db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				email: schema.user.email,
				phone: schema.user.phone,
				loyaltyCard: schema.user.loyaltyCard,
				createdAt: schema.user.createdAt,
				updatedAt: schema.user.updatedAt,
			})
			.from(schema.user)
			.where(eq(schema.user.id, data));

		if (!row) return null;

		// Même approche que `getUsers` : le compte se lit dans un select séparé
		// (une sous-requête corrélée perdrait son qualificatif chez Drizzle).
		const [blame] = await db
			.select({
				count: sql<number>`count(*)::int`,
			})
			.from(schema.reservations)
			.where(
				and(
					eq(schema.reservations.userId, data),
					eq(schema.reservations.isNoShow, 1),
				),
			);

		return {
			...row,
			noShowCount: blame?.count ?? 0,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		};
	});

export const getUserReservations = createServerFn({ method: "GET" })
	.validator((userId: string) => userId)
	.handler(async ({ data }): Promise<UserReservationRow[]> => {
		await requireDashboardSession();
		const rows = await db
			.select({
				id: schema.reservations.id,
				status: schema.reservations.status,
				pickupDate: schema.reservations.pickupDate,
				returnDate: schema.reservations.returnDate,
				totalPrice: schema.reservations.totalPrice,
				createdAt: schema.reservations.createdAt,
				isNoShow: schema.reservations.isNoShow,
			})
			.from(schema.reservations)
			.where(eq(schema.reservations.userId, data))
			.orderBy(desc(schema.reservations.pickupDate));

		const reservationIds = rows.map((r) => r.id);

		const items =
			reservationIds.length > 0
				? await db
						.select({
							id: schema.reservationItems.id,
							reservationId: schema.reservationItems.reservationId,
							itemName: schema.items.name,
							brand: schema.items.brand,
							quantity: schema.reservationItems.quantity,
							unitPrice: schema.reservationItems.priceAppliedAtReservation,
						})
						.from(schema.reservationItems)
						.innerJoin(
							schema.itemVariants,
							eq(schema.reservationItems.variantId, schema.itemVariants.id),
						)
						.innerJoin(
							schema.items,
							eq(schema.itemVariants.itemId, schema.items.id),
						)
						.where(
							inArray(schema.reservationItems.reservationId, reservationIds),
						)
				: [];

		const itemsByReservation = new Map<string, UserReservationRow["items"]>();
		for (const item of items) {
			if (!itemsByReservation.has(item.reservationId)) {
				itemsByReservation.set(item.reservationId, []);
			}
			itemsByReservation.get(item.reservationId)?.push({
				id: item.id,
				itemName: item.itemName,
				brand: item.brand,
				quantity: item.quantity,
				unitPrice: item.unitPrice,
			});
		}

		return rows.map((r) => ({
			id: r.id,
			status: r.status,
			pickupDate: r.pickupDate.toISOString(),
			returnDate: r.returnDate.toISOString(),
			totalPrice: r.totalPrice,
			createdAt: r.createdAt.toISOString(),
			isNoShow: r.isNoShow,
			items: itemsByReservation.get(r.id) ?? [],
		}));
	});

const updateUserSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1, "Le nom est requis"),
	email: z.string().email("Email invalide"),
	phone: z.string().min(1, "Le téléphone est requis"),
	loyaltyCard: z.string().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateUser = createServerFn({ method: "POST" })
	.validator(updateUserSchema.parse)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		const existing = await db
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(
				and(
					eq(schema.user.email, data.email),
					sql`${schema.user.id} != ${data.id}`,
				),
			);

		if (existing.length > 0) {
			throw new Error("Un client avec cet email existe déjà");
		}

		await db
			.update(schema.user)
			.set({
				name: data.name,
				email: data.email,
				phone: data.phone,
				loyaltyCard: data.loyaltyCard ?? null,
				updatedAt: new Date(),
			})
			.where(eq(schema.user.id, data.id));

		return { success: true };
	});

export const deleteUser = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string() }))
	.handler(async ({ data }) => {
		await requireDashboardSession();
		await db.delete(schema.user).where(eq(schema.user.id, data.id));
		return { success: true };
	});
