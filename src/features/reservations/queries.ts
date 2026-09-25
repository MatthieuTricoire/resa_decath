import { createServerFn } from "@tanstack/react-start";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	ilike,
	inArray,
	lt,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { requireDashboardSession } from "#/features/auth/queries";
import {
	evaluateItemAvailability,
	getReservationDurationDays,
} from "#/features/reservations/availability";
import { getRentalSettingsRecord } from "#/features/settings/queries";

export type ReservationLineItem = {
	id: string;
	variantId: string;
	priceOptionId: string | null;
	itemName: string;
	brand: string;
	variantSku: string | null;
	priceOptionLabel: string;
	priceOptionBarcode: string;
	quantity: number;
	unitPrice: string;
};

export type ReservationRow = {
	id: string;
	userId: string;
	clientName: string;
	clientEmail: string;
	clientPhone: string | null;
	clientLoyaltyCard: string | null;
	pickupDate: string;
	returnDate: string;
	status: string;
	createdAt: string;
	totalPrice: string;
	isNoShow: number;
	items: ReservationLineItem[];
};

const activeStatuses = [
	"PENDING_VERIFICATION",
	"CONFIRMED",
	"COLLECTED",
] as const;

export const getReservations = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			status: z.string().optional(),
			search: z.string().optional(),
			period: z.enum(["today", "active", "all"]).default("today"),
		}),
	)
	.handler(async ({ data }): Promise<ReservationRow[]> => {
		const conditions: SQL[] = [];

		if (data.period === "today") {
			const today = sql`CURRENT_DATE`;
			const condition = or(
				sql`DATE(${schema.reservations.pickupDate}) = ${today}`,
				sql`DATE(${schema.reservations.returnDate}) = ${today}`,
				and(
					sql`${schema.reservations.returnDate} < ${today}`,
					inArray(schema.reservations.status, [...activeStatuses]),
				),
			);
			if (condition) conditions.push(condition);
		} else if (data.period === "active") {
			conditions.push(inArray(schema.reservations.status, [...activeStatuses]));
		}

		if (data.status) {
			conditions.push(
				eq(
					schema.reservations.status,
					data.status as (typeof activeStatuses)[number],
				),
			);
		}

		if (data.search) {
			const q = `%${data.search}%`;
			const condition = or(
				ilike(schema.user.name, q),
				ilike(schema.user.email, q),
			);
			if (condition) conditions.push(condition);
		}

		const definedConditions = conditions.filter(Boolean) as SQL[];
		const where =
			definedConditions.length > 0 ? and(...definedConditions) : undefined;

		const rows = await db
			.select({
				id: schema.reservations.id,
				userId: schema.reservations.userId,
				clientName: schema.user.name,
				clientEmail: schema.user.email,
				clientPhone: schema.user.phone,
				clientLoyaltyCard: schema.user.loyaltyCard,
				pickupDate: schema.reservations.pickupDate,
				returnDate: schema.reservations.returnDate,
				status: schema.reservations.status,
				createdAt: schema.reservations.createdAt,
				totalPrice: schema.reservations.totalPrice,
				isNoShow: schema.reservations.isNoShow,
			})
			.from(schema.reservations)
			.innerJoin(schema.user, eq(schema.reservations.userId, schema.user.id))
			.where(where)
			.orderBy(desc(schema.reservations.pickupDate));

		const reservationIds = rows.map((r) => r.id);

		const items =
			reservationIds.length > 0
				? await db
						.select({
							id: schema.reservationItems.id,
							reservationId: schema.reservationItems.reservationId,
							variantId: schema.reservationItems.variantId,
							priceOptionId: schema.reservationItems.priceOptionId,
							itemName: schema.items.name,
							brand: schema.items.brand,
							variantSku: schema.itemVariants.decathlonSku,
							priceOptionLabel: sql<string>`COALESCE(${schema.reservationItems.label}, ${schema.priceOptions.label})`,
							priceOptionBarcode: sql<string>`COALESCE(${schema.priceOptions.barcode}, ${schema.reservationItems.id}::text)`,
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
						.leftJoin(
							schema.priceOptions,
							eq(schema.reservationItems.priceOptionId, schema.priceOptions.id),
						)
						.where(
							inArray(schema.reservationItems.reservationId, reservationIds),
						)
				: [];

		const itemsByReservation = new Map<string, ReservationLineItem[]>();
		for (const item of items) {
			if (!itemsByReservation.has(item.reservationId)) {
				itemsByReservation.set(item.reservationId, []);
			}
			itemsByReservation.get(item.reservationId)?.push({
				id: item.id,
				variantId: item.variantId,
				priceOptionId: item.priceOptionId,
				itemName: item.itemName,
				brand: item.brand,
				variantSku: item.variantSku,
				priceOptionLabel: item.priceOptionLabel ?? "—",
				priceOptionBarcode: item.priceOptionBarcode ?? "—",
				quantity: item.quantity,
				unitPrice: item.unitPrice,
			});
		}

		return rows.map((r) => ({
			...r,
			pickupDate: r.pickupDate.toISOString(),
			returnDate: r.returnDate.toISOString(),
			createdAt: r.createdAt.toISOString(),
			items: itemsByReservation.get(r.id) ?? [],
		}));
	});

export const getReservation = createServerFn({ method: "GET" })
	.inputValidator((id: string) => id)
	.handler(async ({ data }): Promise<ReservationRow | null> => {
		const [row] = await db
			.select({
				id: schema.reservations.id,
				userId: schema.reservations.userId,
				clientName: schema.user.name,
				clientEmail: schema.user.email,
				clientPhone: schema.user.phone,
				clientLoyaltyCard: schema.user.loyaltyCard,
				pickupDate: schema.reservations.pickupDate,
				returnDate: schema.reservations.returnDate,
				status: schema.reservations.status,
				createdAt: schema.reservations.createdAt,
				totalPrice: schema.reservations.totalPrice,
				isNoShow: schema.reservations.isNoShow,
			})
			.from(schema.reservations)
			.innerJoin(schema.user, eq(schema.reservations.userId, schema.user.id))
			.where(eq(schema.reservations.id, data));

		if (!row) return null;

		const items = await db
			.select({
				id: schema.reservationItems.id,
				variantId: schema.reservationItems.variantId,
				priceOptionId: schema.reservationItems.priceOptionId,
				itemName: schema.items.name,
				brand: schema.items.brand,
				variantSku: schema.itemVariants.decathlonSku,
				priceOptionLabel: sql<string>`COALESCE(${schema.reservationItems.label}, ${schema.priceOptions.label})`,
				priceOptionBarcode: sql<string>`COALESCE(${schema.priceOptions.barcode}, ${schema.reservationItems.id}::text)`,
				quantity: schema.reservationItems.quantity,
				unitPrice: schema.reservationItems.priceAppliedAtReservation,
			})
			.from(schema.reservationItems)
			.innerJoin(
				schema.itemVariants,
				eq(schema.reservationItems.variantId, schema.itemVariants.id),
			)
			.innerJoin(schema.items, eq(schema.itemVariants.itemId, schema.items.id))
			.leftJoin(
				schema.priceOptions,
				eq(schema.reservationItems.priceOptionId, schema.priceOptions.id),
			)
			.where(eq(schema.reservationItems.reservationId, data));

		return {
			...row,
			pickupDate: row.pickupDate.toISOString(),
			returnDate: row.returnDate.toISOString(),
			createdAt: row.createdAt.toISOString(),
			items: items.map((item) => ({
				id: item.id,
				variantId: item.variantId,
				priceOptionId: item.priceOptionId,
				itemName: item.itemName,
				brand: item.brand,
				variantSku: item.variantSku,
				priceOptionLabel: item.priceOptionLabel ?? "—",
				priceOptionBarcode: item.priceOptionBarcode ?? "—",
				quantity: item.quantity,
				unitPrice: item.unitPrice,
			})),
		};
	});

const createReservationSchema = z
	.object({
		userId: z.string().min(1),
		pickupDate: z.string().datetime(),
		returnDate: z.string().datetime(),
		items: z
			.array(
				z.object({
					variantId: z.string().min(1),
					priceOptionId: z.string().min(1).optional(),
					quantity: z.coerce.number().int().min(1),
				}),
			)
			.min(1),
	})
	.refine(
		(data) =>
			new Date(data.returnDate).getTime() > new Date(data.pickupDate).getTime(),
		"La date de retour doit être après la date de retrait",
	);

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const createReservation = createServerFn({ method: "POST" })
	.inputValidator(createReservationSchema.parse)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		const pickup = new Date(data.pickupDate);
		const returnD = new Date(data.returnDate);
		const reservationDurationDays = getReservationDurationDays(pickup, returnD);
		if (reservationDurationDays === null || reservationDurationDays < 1) {
			throw new Error("Durée de location invalide");
		}

		const requestedVariantIds = [
			...new Set(data.items.map((item) => item.variantId)),
		];
		const [settings, variants] = await Promise.all([
			getRentalSettingsRecord(),
			db
				.select({
					id: schema.itemVariants.id,
					itemName: schema.items.name,
					totalStock: schema.itemVariants.totalStock,
					pricingMode: schema.itemVariants.pricingMode,
					dailyPrice: schema.itemVariants.dailyPrice,
					status: schema.itemVariants.status,
					season: schema.items.season,
					availableFrom: schema.items.availableFrom,
					availableTo: schema.items.availableTo,
					minDuration: schema.items.minDuration,
					minDurationUnit: schema.items.minDurationUnit,
				})
				.from(schema.itemVariants)
				.innerJoin(
					schema.items,
					eq(schema.itemVariants.itemId, schema.items.id),
				)
				.where(inArray(schema.itemVariants.id, requestedVariantIds)),
		]);
		if (variants.length !== requestedVariantIds.length) {
			throw new Error("Une des variantes sélectionnées est introuvable");
		}
		const variantById = new Map(
			variants.map((variant) => [variant.id, variant]),
		);

		for (const variant of variants) {
			const availability = evaluateItemAvailability({
				item: variant,
				settings,
				pickupDate: pickup,
				returnDate: returnD,
			});
			if (availability.available) continue;
			const message = {
				rentals_closed: "Les locations sont actuellement fermées.",
				variant_unavailable: `« ${variant.itemName} » n’est pas disponible à la location.`,
				outside_item_period: `La période de disponibilité de « ${variant.itemName} » ne couvre pas toute la réservation.`,
				below_minimum_duration: `La durée de location est trop courte pour « ${variant.itemName} ».`,
				season_not_configured: "Le calendrier saisonnier n’est pas configuré.",
				outside_active_season: `« ${variant.itemName} » n’est pas disponible pendant cette période.`,
			}[availability.reason ?? "outside_active_season"];
			throw new Error(message);
		}

		const itemsWithPrices = await Promise.all(
			data.items.map(async (item) => {
				const variant = variantById.get(item.variantId);
				if (!variant) throw new Error("Variante introuvable");

				let unitPrice: number;
				let label: string;
				if (variant.pricingMode === "per_day") {
					if (item.priceOptionId) {
						throw new Error(
							`Cette variante est tarifée à la journée : ${item.variantId}`,
						);
					}
					const daily = Number.parseFloat(variant.dailyPrice);
					unitPrice = daily * reservationDurationDays;
					label = `${reservationDurationDays} jour${
						reservationDurationDays > 1 ? "s" : ""
					} · ${daily.toFixed(2)} €/j`;
				} else {
					if (!item.priceOptionId) {
						throw new Error(
							`Cette variante exige une option de durée : ${item.variantId}`,
						);
					}
					const [priceOption] = await db
						.select()
						.from(schema.priceOptions)
						.where(
							and(
								eq(schema.priceOptions.id, item.priceOptionId),
								eq(schema.priceOptions.variantId, item.variantId),
							),
						);
					if (!priceOption || !priceOption.isActive) {
						throw new Error(
							`Option de prix introuvable ou inactive : ${item.priceOptionId}`,
						);
					}
					if (priceOption.duration !== reservationDurationDays) {
						throw new Error(
							`L’option de prix sélectionnée ne correspond pas à la durée de ${reservationDurationDays} jour(s).`,
						);
					}
					unitPrice = Number.parseFloat(priceOption.price);
					label = priceOption.label;
				}

				return {
					variantId: item.variantId,
					priceOptionId: item.priceOptionId ?? null,
					label,
					quantity: item.quantity,
					unitPrice,
					priceAppliedAtReservation: String(unitPrice.toFixed(2)),
				};
			}),
		);
		const totalPrice = itemsWithPrices.reduce(
			(total, item) => total + item.unitPrice * item.quantity,
			0,
		);

		const activeStatuses = [
			"PENDING_VERIFICATION",
			"CONFIRMED",
			"COLLECTED",
		] as const;
		const requestedQuantities = new Map<string, number>();
		for (const item of data.items) {
			requestedQuantities.set(
				item.variantId,
				(requestedQuantities.get(item.variantId) ?? 0) + item.quantity,
			);
		}

		const expiration = new Date(pickup);
		expiration.setHours(expiration.getHours() + 2);

		return db.transaction(async (tx) => {
			const lockedVariants = await tx
				.select({
					id: schema.itemVariants.id,
					totalStock: schema.itemVariants.totalStock,
				})
				.from(schema.itemVariants)
				.where(inArray(schema.itemVariants.id, requestedVariantIds))
				.orderBy(asc(schema.itemVariants.id))
				.for("update");
			if (lockedVariants.length !== requestedVariantIds.length) {
				throw new Error("Une des variantes sélectionnées est introuvable");
			}
			const lockedVariantById = new Map(
				lockedVariants.map((variant) => [variant.id, variant]),
			);

			for (const [variantId, requestedQuantity] of requestedQuantities) {
				const variant = variantById.get(variantId);
				const lockedVariant = lockedVariantById.get(variantId);
				if (!variant || !lockedVariant) throw new Error("Variante introuvable");
				const [{ reservedQuantity }] = await tx
					.select({
						reservedQuantity: sql<number>`COALESCE(SUM(${schema.reservationItems.quantity}), 0)::int`,
					})
					.from(schema.reservationItems)
					.innerJoin(
						schema.reservations,
						eq(schema.reservationItems.reservationId, schema.reservations.id),
					)
					.where(
						and(
							eq(schema.reservationItems.variantId, variantId),
							inArray(schema.reservations.status, [...activeStatuses]),
							lt(schema.reservations.pickupDate, returnD),
							gt(schema.reservations.returnDate, pickup),
						),
					);

				const available = lockedVariant.totalStock - Number(reservedQuantity);
				if (requestedQuantity > available) {
					throw new Error(
						`Stock insuffisant pour « ${variant.itemName} » : ${requestedQuantity} demandé(s), ${Math.max(0, available)} disponible(s)${available >= 0 ? "" : ` (dont ${-available} en surréservation actuelle)`}`,
					);
				}
			}

			const [reservation] = await tx
				.insert(schema.reservations)
				.values({
					userId: data.userId,
					status: "CONFIRMED",
					pickupDate: pickup,
					returnDate: returnD,
					expirationAtribute: expiration,
					totalPrice: String(totalPrice.toFixed(2)),
				})
				.returning();

			await tx.insert(schema.reservationItems).values(
				itemsWithPrices.map((item) => ({
					reservationId: reservation.id,
					variantId: item.variantId,
					priceOptionId: item.priceOptionId,
					label: item.label,
					quantity: item.quantity,
					priceAppliedAtReservation: item.priceAppliedAtReservation,
				})),
			);

			return reservation;
		});
	});

const statusTransitions: Record<string, string[]> = {
	PENDING_VERIFICATION: ["CONFIRMED", "CANCELLED"],
	CONFIRMED: ["COLLECTED", "CANCELLED"],
	COLLECTED: ["RETURNED"],
	RETURNED: [],
	CANCELLED: [],
	EXPIRED: [],
};

export const updateReservationStatus = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			id: z.string().min(1),
			status: z.enum([
				"PENDING_VERIFICATION",
				"CONFIRMED",
				"COLLECTED",
				"RETURNED",
				"CANCELLED",
				"EXPIRED",
			]),
		}),
	)
	.handler(async ({ data }) => {
		const [reservation] = await db
			.select({
				id: schema.reservations.id,
				status: schema.reservations.status,
			})
			.from(schema.reservations)
			.where(eq(schema.reservations.id, data.id));

		if (!reservation) {
			throw new Error("Réservation introuvable");
		}

		const allowed = statusTransitions[reservation.status] ?? [];
		if (!allowed.includes(data.status)) {
			throw new Error(
				`Transition invalide : ${reservation.status} → ${data.status}`,
			);
		}

		await db
			.update(schema.reservations)
			.set({ status: data.status })
			.where(eq(schema.reservations.id, data.id));

		return { success: true };
	});

export type DashboardKPIs = {
	todayCount: number;
	activeCount: number;
	monthlyRevenue: string;
	pendingPickup: number;
};

export const getDashboardKPIs = createServerFn({ method: "GET" }).handler(
	async (): Promise<DashboardKPIs> => {
		const today = sql`CURRENT_DATE`;
		const monthStart = sql`date_trunc('month', CURRENT_DATE)`;

		const [todayCount, activeCount, monthlyRevenue, pendingPickup] =
			await Promise.all([
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(schema.reservations)
					.where(sql`DATE(${schema.reservations.pickupDate}) = ${today}`)
					.then((r) => Number(r[0]?.count ?? 0)),

				db
					.select({ count: sql<number>`count(*)::int` })
					.from(schema.reservations)
					.where(
						inArray(schema.reservations.status, ["CONFIRMED", "COLLECTED"]),
					)
					.then((r) => Number(r[0]?.count ?? 0)),

				db
					.select({
						revenue: sql<string>`coalesce(sum(${schema.reservations.totalPrice}), '0')`,
					})
					.from(schema.reservations)
					.where(
						and(
							sql`${schema.reservations.createdAt} >= ${monthStart}`,
							eq(schema.reservations.status, "RETURNED"),
						),
					)
					.then((r) => r[0]?.revenue ?? "0"),

				db
					.select({ count: sql<number>`count(*)::int` })
					.from(schema.reservations)
					.where(
						and(
							sql`DATE(${schema.reservations.pickupDate}) = ${today}`,
							eq(schema.reservations.status, "PENDING_VERIFICATION"),
						),
					)
					.then((r) => Number(r[0]?.count ?? 0)),
			]);

		return { todayCount, activeCount, monthlyRevenue, pendingPickup };
	},
);

export type TodayReservationRow = {
	id: string;
	clientName: string;
	clientEmail: string;
	clientPhone: string | null;
	time: string;
	pickupDate: string;
	returnDate: string;
	status: string;
	itemCount: number;
};

export type TodaySchedule = {
	pickups: TodayReservationRow[];
	returns: TodayReservationRow[];
	overdueReturns: TodayReservationRow[];
	expiredPickups: TodayReservationRow[];
};

export const getTodaySchedule = createServerFn({ method: "GET" }).handler(
	async (): Promise<TodaySchedule> => {
		const now = new Date();
		const today = sql`CURRENT_DATE`;
		const dayOf = (d: Date) =>
			new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

		const todayReservations = await db
			.select({
				id: schema.reservations.id,
				clientName: schema.user.name,
				clientEmail: schema.user.email,
				clientPhone: schema.user.phone,
				pickupDate: schema.reservations.pickupDate,
				returnDate: schema.reservations.returnDate,
				status: schema.reservations.status,
			})
			.from(schema.reservations)
			.innerJoin(schema.user, eq(schema.reservations.userId, schema.user.id))
			.where(
				and(
					or(
						sql`DATE(${schema.reservations.pickupDate}) = ${today}`,
						sql`DATE(${schema.reservations.returnDate}) = ${today}`,
						and(
							eq(schema.reservations.status, "COLLECTED"),
							sql`${schema.reservations.returnDate} < ${today}`,
						),
						and(
							eq(schema.reservations.status, "PENDING_VERIFICATION"),
							sql`${schema.reservations.pickupDate} < ${today}`,
						),
					),
					inArray(schema.reservations.status, [
						"PENDING_VERIFICATION",
						"CONFIRMED",
						"COLLECTED",
					]),
				),
			)
			.orderBy(asc(schema.reservations.pickupDate));

		const reservationIds = todayReservations.map((r) => r.id);

		const itemCounts: Array<{
			reservationId: string;
			count: number;
		}> =
			reservationIds.length > 0
				? await db
						.select({
							reservationId: schema.reservationItems.reservationId,
							count: sql<number>`count(*)::int`,
						})
						.from(schema.reservationItems)
						.where(
							inArray(schema.reservationItems.reservationId, reservationIds),
						)
						.groupBy(schema.reservationItems.reservationId)
				: [];

		const countMap = new Map(itemCounts.map((r) => [r.reservationId, r.count]));

		const pickups: TodayReservationRow[] = [];
		const returns: TodayReservationRow[] = [];
		const overdueReturns: TodayReservationRow[] = [];
		const expiredPickups: TodayReservationRow[] = [];

		for (const r of todayReservations) {
			const itemCount = countMap.get(r.id) ?? 0;

			if (r.status === "PENDING_VERIFICATION") {
				if (dayOf(r.pickupDate) < dayOf(now)) {
					expiredPickups.push({
						id: r.id,
						clientName: r.clientName,
						clientEmail: r.clientEmail,
						clientPhone: r.clientPhone,
						time: r.pickupDate.toLocaleTimeString("fr-FR", {
							hour: "2-digit",
							minute: "2-digit",
						}),
						pickupDate: r.pickupDate.toISOString(),
						returnDate: r.returnDate.toISOString(),
						status: r.status,
						itemCount,
					});
				} else {
					pickups.push({
						id: r.id,
						clientName: r.clientName,
						clientEmail: r.clientEmail,
						clientPhone: r.clientPhone,
						time: r.pickupDate.toLocaleTimeString("fr-FR", {
							hour: "2-digit",
							minute: "2-digit",
						}),
						pickupDate: r.pickupDate.toISOString(),
						returnDate: r.returnDate.toISOString(),
						status: r.status,
						itemCount,
					});
				}
			} else if (r.status === "CONFIRMED") {
				pickups.push({
					id: r.id,
					clientName: r.clientName,
					clientEmail: r.clientEmail,
					clientPhone: r.clientPhone,
					time: r.pickupDate.toLocaleTimeString("fr-FR", {
						hour: "2-digit",
						minute: "2-digit",
					}),
					pickupDate: r.pickupDate.toISOString(),
					returnDate: r.returnDate.toISOString(),
					status: r.status,
					itemCount,
				});
			}

			if (r.status === "COLLECTED") {
				const row: TodayReservationRow = {
					id: r.id,
					clientName: r.clientName,
					clientEmail: r.clientEmail,
					clientPhone: r.clientPhone,
					time: r.returnDate.toLocaleTimeString("fr-FR", {
						hour: "2-digit",
						minute: "2-digit",
					}),
					pickupDate: r.pickupDate.toISOString(),
					returnDate: r.returnDate.toISOString(),
					status: r.status,
					itemCount,
				};

				if (dayOf(r.returnDate) < dayOf(now)) {
					overdueReturns.push(row);
				} else {
					returns.push(row);
				}
			}
		}

		return { pickups, returns, overdueReturns, expiredPickups };
	},
);

const getAvailableStockSchema = z.object({
	variantId: z.string().min(1),
	pickupDate: z.string().datetime(),
	returnDate: z.string().datetime(),
});

export const getAvailableStock = createServerFn({ method: "GET" })
	.inputValidator(getAvailableStockSchema.parse)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		const [variant] = await db
			.select({ totalStock: schema.itemVariants.totalStock })
			.from(schema.itemVariants)
			.where(eq(schema.itemVariants.id, data.variantId));

		if (!variant) throw new Error("Variante introuvable");

		const pickup = new Date(data.pickupDate);
		const ret = new Date(data.returnDate);

		const activeStatuses = [
			"PENDING_VERIFICATION",
			"CONFIRMED",
			"COLLECTED",
		] as const;

		const [{ reservedQuantity }] = await db
			.select({
				reservedQuantity: sql<number>`COALESCE(SUM(${schema.reservationItems.quantity}), 0)::int`,
			})
			.from(schema.reservationItems)
			.innerJoin(
				schema.reservations,
				eq(schema.reservationItems.reservationId, schema.reservations.id),
			)
			.where(
				and(
					eq(schema.reservationItems.variantId, data.variantId),
					inArray(schema.reservations.status, [...activeStatuses]),
					lt(schema.reservations.pickupDate, ret),
					gt(schema.reservations.returnDate, pickup),
				),
			);

		const totalStock = variant.totalStock;
		const reserved = Number(reservedQuantity);

		return {
			totalStock,
			reservedQuantity: reserved,
			availableQuantity: Math.max(0, totalStock - reserved),
		};
	});

export {
	type CreateUserInput,
	createUser,
	getUsers,
} from "#/features/users/queries";
