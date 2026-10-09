import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import {
	requireAdminSession,
	requireDashboardSession,
} from "#/features/auth/queries";

// Forfait mensuel + commissions (% du CA Web et Magasin) appliqués au gérant de la plateforme.
// Si la table est vide (jamais seedée), valeurs par défaut.
const DEFAULT_MONTHLY_FEE = 30;
const DEFAULT_COMMISSION_RATE_WEB = 10;
const DEFAULT_COMMISSION_RATE_STORE = 5;
const MONTHS_COUNT = 12;

export type BillingSettings = {
	monthlyFee: number;
	commissionRateWeb: number;
	commissionRateStore: number;
};

export type MonthlyBillingRow = {
	month: string;
	label: string;
	revenue: number;
	webRevenue: number;
	storeRevenue: number;
	reservationCount: number;
	webReservationCount: number;
	storeReservationCount: number;
	webCommission: number;
	storeCommission: number;
	commission: number;
	monthlyFee: number;
	totalDue: number;
};

const monthKey = sql<string>`to_char(date_trunc('month', ${schema.reservations.pickupDate}), 'YYYY-MM')`;

type BillingAggRow = {
	month: string;
	revenue: string;
	webRevenue: string;
	storeRevenue: string;
	count: number;
	webCount: number;
	storeCount: number;
};

async function getSettingsOrDefaults(): Promise<BillingSettings> {
	const row = await db.query.billingSettings.findFirst();
	return {
		monthlyFee: Number.parseFloat(
			row?.monthlyFee ?? String(DEFAULT_MONTHLY_FEE),
		),
		commissionRateWeb: Number.parseFloat(
			row?.commissionRateWeb ?? String(DEFAULT_COMMISSION_RATE_WEB),
		),
		commissionRateStore: Number.parseFloat(
			row?.commissionRateStore ?? String(DEFAULT_COMMISSION_RATE_STORE),
		),
	};
}

export const getBillingSettings = createServerFn({ method: "GET" }).handler(
	async (): Promise<BillingSettings> => {
		await requireDashboardSession();
		return getSettingsOrDefaults();
	},
);

const updateSettingsSchema = z.object({
	monthlyFee: z.coerce.number().min(0, "Le forfait doit être positif"),
	commissionRateWeb: z.coerce
		.number()
		.min(0, "La commission web doit être positive")
		.max(100, "La commission web ne peut pas dépasser 100 %"),
	commissionRateStore: z.coerce
		.number()
		.min(0, "La commission magasin doit être positive")
		.max(100, "La commission magasin ne peut pas dépasser 100 %"),
});

export const updateBillingSettings = createServerFn({ method: "POST" })
	.validator(updateSettingsSchema.parse)
	.handler(async ({ data }): Promise<BillingSettings> => {
		await requireAdminSession();
		const values = {
			monthlyFee: data.monthlyFee.toFixed(2),
			commissionRateWeb: data.commissionRateWeb.toFixed(2),
			commissionRateStore: data.commissionRateStore.toFixed(2),
			updatedAt: new Date(),
		};
		await db
			.insert(schema.billingSettings)
			.values({ id: 1, ...values })
			.onConflictDoUpdate({
				target: schema.billingSettings.id,
				set: values,
			});
		return {
			monthlyFee: data.monthlyFee,
			commissionRateWeb: data.commissionRateWeb,
			commissionRateStore: data.commissionRateStore,
		};
	});

export function calculateMonthBilling({
	webRevenue,
	storeRevenue,
	webReservationCount,
	storeReservationCount,
	settings,
}: {
	webRevenue: number;
	storeRevenue: number;
	webReservationCount: number;
	storeReservationCount: number;
	settings: Pick<
		BillingSettings,
		"monthlyFee" | "commissionRateWeb" | "commissionRateStore"
	>;
}) {
	const revenue = webRevenue + storeRevenue;
	const reservationCount = webReservationCount + storeReservationCount;
	const webCommission = webRevenue * (settings.commissionRateWeb / 100);
	const storeCommission = storeRevenue * (settings.commissionRateStore / 100);
	const commission = webCommission + storeCommission;
	const totalDue = settings.monthlyFee + commission;
	return {
		revenue,
		webRevenue,
		storeRevenue,
		reservationCount,
		webReservationCount,
		storeReservationCount,
		webCommission,
		storeCommission,
		commission,
		monthlyFee: settings.monthlyFee,
		totalDue,
	};
}

export const getMonthlyBilling = createServerFn({ method: "GET" }).handler(
	async (): Promise<{
		settings: BillingSettings;
		months: MonthlyBillingRow[];
	}> => {
		await requireDashboardSession();
		const now = new Date();
		const from = new Date(
			now.getFullYear(),
			now.getMonth() - (MONTHS_COUNT - 1),
			1,
		);

		const aggRows: BillingAggRow[] = await db
			.select({
				month: monthKey,
				revenue:
					sql<string>`coalesce(sum(${schema.reservations.totalPrice}), '0')`.as(
						"revenue",
					),
				webRevenue:
					sql<string>`coalesce(sum(case when ${schema.reservations.source} = 'WEB' then ${schema.reservations.totalPrice} else 0 end), '0')`.as(
						"web_revenue",
					),
				storeRevenue:
					sql<string>`coalesce(sum(case when ${schema.reservations.source} = 'STORE' then ${schema.reservations.totalPrice} else 0 end), '0')`.as(
						"store_revenue",
					),
				count: sql<number>`count(*)::int`.as("count"),
				webCount:
					sql<number>`coalesce(sum(case when ${schema.reservations.source} = 'WEB' then 1 else 0 end), 0)::int`.as(
						"web_count",
					),
				storeCount:
					sql<number>`coalesce(sum(case when ${schema.reservations.source} = 'STORE' then 1 else 0 end), 0)::int`.as(
						"store_count",
					),
			})
			.from(schema.reservations)
			.where(
				and(
					eq(schema.reservations.status, "RETURNED"),
					gte(schema.reservations.pickupDate, from),
				),
			)
			.groupBy(monthKey)
			.orderBy(desc(monthKey));

		const settings = await getSettingsOrDefaults();

		const byMonth = new Map(aggRows.map((r) => [r.month, r]));
		const months: MonthlyBillingRow[] = [];

		for (let i = MONTHS_COUNT - 1; i >= 0; i--) {
			const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
			const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
			const raw = byMonth.get(key);
			const webRevenue = raw ? Number.parseFloat(raw.webRevenue) : 0;
			const storeRevenue = raw ? Number.parseFloat(raw.storeRevenue) : 0;
			const webReservationCount = raw?.webCount ?? 0;
			const storeReservationCount = raw?.storeCount ?? 0;
			const calc = calculateMonthBilling({
				webRevenue,
				storeRevenue,
				webReservationCount,
				storeReservationCount,
				settings,
			});
			months.push({
				month: key,
				label: start
					.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })
					.replace(".", ""),
				...calc,
			});
		}

		return { settings, months };
	},
);
