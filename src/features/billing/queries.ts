import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import {
	requireAdminSession,
	requireDashboardSession,
} from "#/features/auth/queries";

// Forfait mensuel + commission (% du CA) appliqués au gérant de la plateforme.
// Si la table est vide (jamais seedée), valeurs par défaut.
const DEFAULT_MONTHLY_FEE = 30;
const DEFAULT_COMMISSION_RATE = 10;
const MONTHS_COUNT = 12;

export type BillingSettings = {
	monthlyFee: number;
	commissionRate: number;
};

export type MonthlyBillingRow = {
	month: string;
	label: string;
	revenue: number;
	reservationCount: number;
	commission: number;
	monthlyFee: number;
	totalDue: number;
};

const monthKey = sql<string>`to_char(date_trunc('month', ${schema.reservations.pickupDate}), 'YYYY-MM')`;

type BillingAggRow = { month: string; revenue: string; count: number };

async function getSettingsOrDefaults(): Promise<BillingSettings> {
	const row = await db.query.billingSettings.findFirst();
	return {
		monthlyFee: Number.parseFloat(
			row?.monthlyFee ?? String(DEFAULT_MONTHLY_FEE),
		),
		commissionRate: Number.parseFloat(
			row?.commissionRate ?? String(DEFAULT_COMMISSION_RATE),
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
	commissionRate: z.coerce
		.number()
		.min(0, "La commission doit être positive")
		.max(100, "La commission ne peut pas dépasser 100 %"),
});

export const updateBillingSettings = createServerFn({ method: "POST" })
	.inputValidator(updateSettingsSchema.parse)
	.handler(async ({ data }): Promise<BillingSettings> => {
		await requireAdminSession();
		const values = {
			monthlyFee: data.monthlyFee.toFixed(2),
			commissionRate: data.commissionRate.toFixed(2),
			updatedAt: new Date(),
		};
		await db
			.insert(schema.billingSettings)
			.values({ id: 1, ...values })
			.onConflictDoUpdate({
				target: schema.billingSettings.id,
				set: values,
			});
		return { monthlyFee: data.monthlyFee, commissionRate: data.commissionRate };
	});

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
				count: sql<number>`count(*)::int`.as("count"),
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
			const revenue = raw ? Number.parseFloat(raw.revenue) : 0;
			const commission = revenue * (settings.commissionRate / 100);
			months.push({
				month: key,
				label: start
					.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })
					.replace(".", ""),
				revenue,
				reservationCount: raw?.count ?? 0,
				commission,
				monthlyFee: settings.monthlyFee,
				totalDue: settings.monthlyFee + commission,
			});
		}

		return { settings, months };
	},
);
