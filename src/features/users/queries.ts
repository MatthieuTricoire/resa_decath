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

export type UserRow = {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	loyaltyCard: string | null;
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
	items: Array<{
		id: string;
		itemName: string;
		brand: string;
		quantity: number;
		unitPrice: string;
	}>;
};

export const getUsers = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			search: z.string().optional(),
		}),
	)
	.handler(async ({ data }): Promise<UserRow[]> => {
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

		const rows = await db
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
			.orderBy(asc(schema.user.name));

		return rows.map((r) => ({
			...r,
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
	.inputValidator(createUserSchema.parse)
	.handler(async ({ data }): Promise<{ id: string }> => {
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
	.inputValidator((userId: string) => userId)
	.handler(async ({ data }): Promise<UserRow | null> => {
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

		return {
			...row,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		};
	});

export const getUserReservations = createServerFn({ method: "GET" })
	.inputValidator((userId: string) => userId)
	.handler(async ({ data }): Promise<UserReservationRow[]> => {
		const rows = await db
			.select({
				id: schema.reservations.id,
				status: schema.reservations.status,
				pickupDate: schema.reservations.pickupDate,
				returnDate: schema.reservations.returnDate,
				totalPrice: schema.reservations.totalPrice,
				createdAt: schema.reservations.createdAt,
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
	.inputValidator(updateUserSchema.parse)
	.handler(async ({ data }) => {
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
