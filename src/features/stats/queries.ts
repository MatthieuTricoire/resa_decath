import { createServerFn } from "@tanstack/react-start";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	lte,
	notInArray,
	type SQL,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { requireDashboardSession } from "#/features/auth/queries";

export const statsRangeSchema = z.enum(["7d", "30d", "3m", "12m"]);
export type StatsRange = z.infer<typeof statsRangeSchema>;

const RANGE_DAYS: Record<StatsRange, number> = {
	"7d": 7,
	"30d": 30,
	"3m": 91,
	"12m": 365,
};

// Période filtrée sur pickupDate ∈ [from, to] ; les annulations/no-show sont exclues

function bucketExpr(range: StatsRange): SQL<string> {
	if (range === "7d" || range === "30d") {
		return sql<string>`to_char(date_trunc('day', ${schema.reservations.pickupDate}), 'YYYY-MM-DD')`;
	}
	if (range === "3m") {
		return sql<string>`to_char(date_trunc('week', ${schema.reservations.pickupDate}), 'YYYY-MM-DD')`;
	}
	return sql<string>`to_char(date_trunc('month', ${schema.reservations.pickupDate}), 'YYYY-MM-DD')`;
}

function durationExpr(): SQL<number> {
	return sql<number>`ceil(extract(epoch from (${schema.reservations.returnDate} - ${schema.reservations.pickupDate})) / 86400)::int`;
}

export type StatsSeriesPoint = {
	start: string;
	revenue: number;
	count: number;
};

export type StatsData = {
	range: StatsRange;
	from: string;
	to: string;
	series: StatsSeriesPoint[];
	rentedItems: Array<{
		itemId: string;
		itemName: string;
		categoryName: string | null;
		rentals: number;
		revenue: number;
	}>;
	topItems: Array<{
		itemId: string;
		itemName: string;
		rentals: number;
		revenue: number;
	}>;
	statusDistribution: Array<{ status: string; count: number }>;
	durationDistribution: Array<{ days: number; count: number }>;
	revenueByCategory: Array<{ categoryName: string; revenue: number }>;
	weekdayPattern: Array<{ day: number; count: number }>;
	kpis: {
		totalRevenue: number;
		webRevenue: number;
		storeRevenue: number;
		totalReservations: number;
		webReservations: number;
		storeReservations: number;
		avgDurationDays: number;
		occupancyRate: number;
		/** Nombre de non-présentations (`is_no_show = 1`) sur la période. */
		noShows: number;
	};
};

export const getStatsData = createServerFn({ method: "GET" })
	.validator(statsRangeSchema.parse)
	.handler(async ({ data }): Promise<StatsData> => {
		await requireDashboardSession();
		const to = new Date();
		to.setHours(23, 59, 59, 999);
		const from = new Date(
			to.getTime() - RANGE_DAYS[data] * 86400000 + 86400000,
		);
		from.setHours(0, 0, 0, 0);

		const period = and(
			gte(schema.reservations.pickupDate, from),
			lte(schema.reservations.pickupDate, to),
			// Une réservation annulée n'a rien consommé : la compter ferait baisser
			// le chiffre d'affaires sans qu'aucun matériel soit sorti.
			notInArray(schema.reservations.status, ["CANCELLED"]),
		);

		const [
			seriesRows,
			topItems,
			statusRows,
			durationRows,
			categoryRows,
			weekdayRows,
			kpiRows,
		] = await Promise.all([
			db
				.select({
					start: bucketExpr(data),
					revenue: sql<string>`coalesce(sum(case when ${schema.reservations.status} = 'RETURNED' then ${schema.reservations.totalPrice} else 0 end), '0')`,
					count: sql<number>`count(*)::int`,
				})
				.from(schema.reservations)
				.where(period)
				.groupBy(bucketExpr(data))
				.orderBy(asc(bucketExpr(data))),

			db
				.select({
					itemId: schema.items.id,
					itemName: schema.items.name,
					categoryName: schema.categories.name,
					rentals: sql<number>`sum(${schema.reservationItems.quantity})::int`,
					revenue: sql<string>`coalesce(sum(case when ${schema.reservations.status} = 'RETURNED' then ${schema.reservationItems.priceAppliedAtReservation} * ${schema.reservationItems.quantity} else 0 end), '0')`,
				})
				.from(schema.reservationItems)
				.innerJoin(
					schema.reservations,
					eq(schema.reservationItems.reservationId, schema.reservations.id),
				)
				.innerJoin(
					schema.itemVariants,
					eq(schema.reservationItems.variantId, schema.itemVariants.id),
				)
				.innerJoin(
					schema.items,
					eq(schema.itemVariants.itemId, schema.items.id),
				)
				.leftJoin(
					schema.categories,
					eq(schema.items.categoryId, schema.categories.id),
				)
				.where(period)
				.groupBy(schema.items.id, schema.items.name, schema.categories.name)
				.orderBy(desc(sql`sum(${schema.reservationItems.quantity})`)),

			db
				.select({
					status: schema.reservations.status,
					count: sql<number>`count(*)::int`,
					noShowCount: sql<number>`coalesce(sum(case when ${schema.reservations.isNoShow} = 1 then 1 else 0 end), 0)::int`,
				})
				.from(schema.reservations)
				// Seule sous-requête de la page à garder les annulations : c'est
				// d'elle que sort la répartition par statut, où « Annulée » se
				// scinde en annulation simple et non-présentation. Les autres
				// agrégats (CA, volumes, durées) continuent d'exclure CANCELLED.
				.where(
					and(
						gte(schema.reservations.pickupDate, from),
						lte(schema.reservations.pickupDate, to),
					),
				)
				.groupBy(schema.reservations.status),

			db
				.select({
					days: durationExpr(),
					count: sql<number>`count(*)::int`,
				})
				.from(schema.reservations)
				.where(period)
				.groupBy(durationExpr())
				.orderBy(asc(durationExpr())),

			db
				.select({
					categoryName: schema.categories.name,
					revenue: sql<string>`coalesce(sum(${schema.reservationItems.priceAppliedAtReservation} * ${schema.reservationItems.quantity}), '0')`,
				})
				.from(schema.reservationItems)
				.innerJoin(
					schema.reservations,
					eq(schema.reservationItems.reservationId, schema.reservations.id),
				)
				.innerJoin(
					schema.itemVariants,
					eq(schema.reservationItems.variantId, schema.itemVariants.id),
				)
				.innerJoin(
					schema.items,
					eq(schema.itemVariants.itemId, schema.items.id),
				)
				.innerJoin(
					schema.categories,
					eq(schema.items.categoryId, schema.categories.id),
				)
				.where(
					and(
						gte(schema.reservations.pickupDate, from),
						lte(schema.reservations.pickupDate, to),
						eq(schema.reservations.status, "RETURNED"),
					),
				)
				.groupBy(schema.categories.id, schema.categories.name)
				.orderBy(
					desc(
						sql`sum(${schema.reservationItems.priceAppliedAtReservation} * ${schema.reservationItems.quantity})`,
					),
				),

			db
				.select({
					day: sql<number>`extract(dow from ${schema.reservations.pickupDate})::int`,
					count: sql<number>`count(*)::int`,
				})
				.from(schema.reservations)
				.where(period)
				.groupBy(sql`extract(dow from ${schema.reservations.pickupDate})::int`)
				.orderBy(
					asc(sql`extract(dow from ${schema.reservations.pickupDate})::int`),
				),

			Promise.all([
				db
					.select({
						revenue: sql<string>`coalesce(sum(${schema.reservations.totalPrice}), '0')`,
						webRevenue: sql<string>`coalesce(sum(case when ${schema.reservations.source} = 'WEB' then ${schema.reservations.totalPrice} else 0 end), '0')`,
						storeRevenue: sql<string>`coalesce(sum(case when ${schema.reservations.source} = 'STORE' then ${schema.reservations.totalPrice} else 0 end), '0')`,
					})
					.from(schema.reservations)
					.where(
						and(
							gte(schema.reservations.pickupDate, from),
							lte(schema.reservations.pickupDate, to),
							eq(schema.reservations.status, "RETURNED"),
						),
					)
					.then((r) => ({
						totalRevenue: Number.parseFloat(r[0]?.revenue ?? "0"),
						webRevenue: Number.parseFloat(r[0]?.webRevenue ?? "0"),
						storeRevenue: Number.parseFloat(r[0]?.storeRevenue ?? "0"),
					})),

				db
					.select({
						count: sql<number>`count(*)::int`,
						webCount: sql<number>`coalesce(sum(case when ${schema.reservations.source} = 'WEB' then 1 else 0 end), 0)::int`,
						storeCount: sql<number>`coalesce(sum(case when ${schema.reservations.source} = 'STORE' then 1 else 0 end), 0)::int`,
					})
					.from(schema.reservations)
					.where(period)
					.then((r) => ({
						totalReservations: Number(r[0]?.count ?? 0),
						webReservations: Number(r[0]?.webCount ?? 0),
						storeReservations: Number(r[0]?.storeCount ?? 0),
					})),

				db
					.select({ avg: sql<number>`round(avg(${durationExpr()}), 1)` })
					.from(schema.reservations)
					.where(period)
					.then((r) => Number(r[0]?.avg ?? 0)),

				db
					.select({
						unitDays: sql<number>`coalesce(sum(${schema.reservationItems.quantity} * ${durationExpr()}), 0)::int`,
					})
					.from(schema.reservationItems)
					.innerJoin(
						schema.reservations,
						eq(schema.reservationItems.reservationId, schema.reservations.id),
					)
					.where(period)
					.then((r) => Number(r[0]?.unitDays ?? 0)),

				db
					.select({
						totalStock: sql<number>`coalesce(sum(${schema.itemVariants.totalStock}), 0)::int`,
					})
					.from(schema.itemVariants)
					.then((r) => Number(r[0]?.totalStock ?? 0)),
			]),
		]);

		const [
			revenueKpi,
			reservationsKpi,
			avgDurationDays,
			unitDaysRented,
			totalStock,
		] = kpiRows;

		const capacity = Math.max(1, totalStock * RANGE_DAYS[data]);
		const occupancyRate = Math.min(
			100,
			Math.round((unitDaysRented / capacity) * 1000) / 10,
		);

		// Le total des non-présentations se lit dans la ligne CANCELLED de la
		// répartition par statut : pas de requête en plus, même source.
		const noShows = statusRows.reduce(
			(total, row) =>
				total + (row.status === "CANCELLED" ? Number(row.noShowCount) : 0),
			0,
		);

		const mappedRentedItems = topItems.map((r) => ({
			itemId: r.itemId,
			itemName: r.itemName,
			categoryName: r.categoryName ?? null,
			rentals: Number(r.rentals),
			revenue: Number.parseFloat(r.revenue),
		}));

		return {
			range: data,
			from: from.toISOString(),
			to: to.toISOString(),
			series: seriesRows.map((r) => ({
				start: r.start,
				revenue: Number.parseFloat(r.revenue),
				count: Number(r.count),
			})),
			rentedItems: mappedRentedItems,
			topItems: mappedRentedItems.slice(0, 5),
			statusDistribution: statusRows.flatMap((r) => {
				const count = Number(r.count);
				if (r.status !== "CANCELLED") return [{ status: r.status, count }];
				// Une annulation se raconte en deux : celle du client (il prévient,
				// on libère) et la non-présentation (il n'est jamais venu).
				// `NO_SHOW` est une clé de rendu, jamais un statut réel.
				const noShow = Number(r.noShowCount);
				const cancelled = count - noShow;
				return [
					...(cancelled > 0 ? [{ status: "CANCELLED", count: cancelled }] : []),
					...(noShow > 0 ? [{ status: "NO_SHOW", count: noShow }] : []),
				];
			}),
			durationDistribution: durationRows.map((r) => ({
				days: Number(r.days),
				count: Number(r.count),
			})),
			revenueByCategory: categoryRows.map((r) => ({
				categoryName: r.categoryName,
				revenue: Number.parseFloat(r.revenue),
			})),
			weekdayPattern: weekdayRows.map((r) => ({
				day: Number(r.day),
				count: Number(r.count),
			})),
			kpis: {
				totalRevenue: revenueKpi.totalRevenue,
				webRevenue: revenueKpi.webRevenue,
				storeRevenue: revenueKpi.storeRevenue,
				totalReservations: reservationsKpi.totalReservations,
				webReservations: reservationsKpi.webReservations,
				storeReservations: reservationsKpi.storeReservations,
				avgDurationDays,
				occupancyRate,
				noShows,
			},
		};
	});
