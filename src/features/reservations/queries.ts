import { createServerFn } from "@tanstack/react-start";
import {
	type AnyColumn,
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
	STOCK_CONSUMING_STATUSES as activeStatuses,
	availableQuantity,
} from "#/features/reservations/availability";
import { reserveEquipment } from "#/features/reservations/reserve.server";
import { classifyScheduleRow } from "#/features/reservations/today-schedule";
import { toParisDateKey } from "#/lib/dates";

/**
 * Jour civil d'une colonne de date, vu depuis Paris.
 *
 * Les colonnes `timestamp` de la base sont naïves et portent de l'UTC — le
 * retrait du site est écrit à midi UTC, celui du comptoir à minuit UTC. Il faut
 * donc dire explicitement qu'elles valent UTC (`AT TIME ZONE 'UTC'`), sinon
 * Postgres les lit comme des heures de Paris et décale tout d'une heure.
 *
 * On ne peut pas non plus laisser Postgres trancher le jour avec
 * `CURRENT_DATE` : il renvoie le jour de la session, et la base de production
 * tourne en GMT. Entre 22 h et minuit heure de Paris, « aujourd'hui » en SQL et
 * « aujourd'hui » en JavaScript désignent deux jours différents, et une
 * réservation passe d'un tableau à l'autre.
 */
const parisDayOf = (column: AnyColumn) =>
	sql`(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date`;

/** Le jour civil courant à Paris — le même que celui calculé en JavaScript. */
const parisToday = sql`(now() AT TIME ZONE 'Europe/Paris')::date`;

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

export const getReservations = createServerFn({ method: "GET" })
	.validator(
		z.object({
			status: z.string().optional(),
			search: z.string().optional(),
			period: z.enum(["today", "active", "all"]).default("today"),
		}),
	)
	.handler(async ({ data }): Promise<ReservationRow[]> => {
		await requireDashboardSession();
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
	.validator((id: string) => id)
	.handler(async ({ data }): Promise<ReservationRow | null> => {
		await requireDashboardSession();
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
	.validator(createReservationSchema.parse)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		return reserveEquipment({
			userId: data.userId,
			pickupDate: new Date(data.pickupDate),
			returnDate: new Date(data.returnDate),
			items: data.items,
			source: "STORE",
		});
	});

/**
 * Transitions autorisées, et seules celles-là : `updateReservationStatus`
 * refuse tout ce qui n'y figure pas.
 *
 * La chaîne est linéaire — `CONFIRMED` puis `COLLECTED` puis `RETURNED` — sauf
 * l'annulation, possible tant que le matériel n'est pas sorti. Une réservation
 * retirée ne peut plus être annulée, ni par le client ni par le comptoir : elle
 * est en cours, et seul son retour la clôt.
 *
 * `COLLECTED` est la **seule** écriture qui enregistre qu'un client est venu.
 * Un clic oublié au comptoir et cette information n'existe nulle part ailleurs.
 */
const statusTransitions: Record<string, string[]> = {
	CONFIRMED: ["COLLECTED", "CANCELLED"],
	COLLECTED: ["RETURNED"],
	RETURNED: [],
	CANCELLED: [],
};

export const updateReservationStatus = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: z.string().min(1),
			status: z.enum(["CONFIRMED", "COLLECTED", "RETURNED", "CANCELLED"]),
		}),
	)
	.handler(async ({ data }) => {
		await requireDashboardSession();
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
		await requireDashboardSession();
		// Le début de mois reste calculé par Postgres sur sa propre session : il
		// ne s'agit que d'un découpage mensuel, où une heure de décalage est sans
		// conséquence. Les comparaisons de *jours*, elles, passent par Paris.
		const monthStart = sql`date_trunc('month', CURRENT_DATE)`;

		const [todayCount, activeCount, monthlyRevenue, pendingPickup] =
			await Promise.all([
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(schema.reservations)
					.where(eq(parisDayOf(schema.reservations.pickupDate), parisToday))
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

				// Retraits attendus aujourd'hui : confirmados et pas encore sortis.
				// C'est la suite directe de `pickups` — les deux chiffres doivent
				// dire la même chose.
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(schema.reservations)
					.where(
						and(
							eq(parisDayOf(schema.reservations.pickupDate), parisToday),
							eq(schema.reservations.status, "CONFIRMED"),
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
	pickupDate: string;
	returnDate: string;
	status: string;
	itemCount: number;
};

export type TodaySchedule = {
	pickups: TodayReservationRow[];
	returns: TodayReservationRow[];
	lateReturns: TodayReservationRow[];
	latePickups: TodayReservationRow[];
};

export const getTodaySchedule = createServerFn({ method: "GET" }).handler(
	async (): Promise<TodaySchedule> => {
		await requireDashboardSession();
		const todayKey = toParisDateKey(new Date());

		// On ramène toutes les réservations non clôturées, sans filtre de date en
		// SQL, et c'est `classifyScheduleRow` qui décide de leur sort. La date du
		// jour ne change pas beaucoup entre deux requêtes, et le classement se
		// teste sans base de données.
		//
		// Pas de borne basse sur la date : une réservation bloquée au statut
		// `COLLECTED` par une saisie oubliée doit rester visible au tableau des
		// retours en retard, même six mois plus tard. L'ensemble reste petit par
		// nature — ce sont les seules réservations en cours, jamais supprimées.
		const openReservations = await db
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
			.where(inArray(schema.reservations.status, ["CONFIRMED", "COLLECTED"]))
			.orderBy(asc(schema.reservations.pickupDate));

		const reservationIds = openReservations.map((r) => r.id);

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

		const schedule: TodaySchedule = {
			pickups: [],
			returns: [],
			lateReturns: [],
			latePickups: [],
		};

		for (const r of openReservations) {
			const bucket = classifyScheduleRow(
				r.status,
				r.pickupDate,
				r.returnDate,
				todayKey,
			);
			if (!bucket) continue;

			schedule[bucket].push({
				id: r.id,
				clientName: r.clientName,
				clientEmail: r.clientEmail,
				clientPhone: r.clientPhone,
				pickupDate: r.pickupDate.toISOString(),
				returnDate: r.returnDate.toISOString(),
				status: r.status,
				itemCount: countMap.get(r.id) ?? 0,
			});
		}

		return schedule;
	},
);

const getAvailableStockSchema = z.object({
	variantId: z.string().min(1),
	pickupDate: z.string().datetime(),
	returnDate: z.string().datetime(),
});

export const getAvailableStock = createServerFn({ method: "GET" })
	.validator(getAvailableStockSchema.parse)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		const [variant] = await db
			.select({ totalStock: schema.itemVariants.totalStock })
			.from(schema.itemVariants)
			.where(eq(schema.itemVariants.id, data.variantId));

		if (!variant) throw new Error("Variante introuvable");

		const pickup = new Date(data.pickupDate);
		const ret = new Date(data.returnDate);

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
			availableQuantity: availableQuantity(totalStock, reserved),
		};
	});

export {
	type CreateUserInput,
	createUser,
	getUsers,
} from "#/features/users/queries";
