import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	addDays,
	addMonths,
	format,
	startOfDay,
	startOfISOWeek,
	startOfMonth,
} from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import { useMemo, useState } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Pie,
	PieChart,
	XAxis,
	YAxis,
} from "recharts";
import { KpiCard } from "#/components/kpi-card";
import { SiteHeader } from "#/components/site-header";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "#/components/ui/chart";
import {
	getStatsData,
	type StatsData,
	type StatsRange,
} from "#/features/stats/queries";
import { queryKeys } from "#/features/stats/query-keys";
import { cn } from "#/lib/utils";

const RANGE_OPTIONS: Array<{ key: StatsRange; label: string }> = [
	{ key: "7d", label: "7 jours" },
	{ key: "30d", label: "30 jours" },
	{ key: "3m", label: "3 mois" },
	{ key: "12m", label: "12 mois" },
];

const STATUS_LABELS: Record<string, string> = {
	PENDING_VERIFICATION: "En attente de vérification",
	CONFIRMED: "Confirmée",
	COLLECTED: "Récupérée",
	RETURNED: "Retournée",
	CANCELLED: "Annulée",
	EXPIRED: "Expirée",
};

const WEEKDAY_ORDER = ["L", "M", "M", "J", "V", "S", "D"];

const PALETTE = [
	"#ef4444",
	"#f59e0b",
	"#eab308",
	"#22c55e",
	"#0ea5e9",
	"#6366f1",
	"#a855f7",
	"#ec4899",
];

const euro = (n: number) =>
	n.toLocaleString("fr-FR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

function bucketStarts(range: StatsRange, from: Date, to: Date) {
	const starts: Date[] = [];
	if (range === "7d" || range === "30d") {
		let d = startOfDay(from);
		while (d <= to) {
			starts.push(d);
			d = addDays(d, 1);
		}
	} else if (range === "3m") {
		let d = startOfISOWeek(from);
		while (d <= to) {
			starts.push(d);
			d = addDays(d, 7);
		}
	} else {
		let d = startOfMonth(from);
		while (d <= to) {
			starts.push(d);
			d = addMonths(d, 1);
		}
	}
	return starts;
}

function useSeries(data: StatsData | undefined) {
	return useMemo(() => {
		if (!data) return { points: [], weekdays: [] };
		const byKey = new Map(data.series.map((s) => [s.start, s]));
		const starts = bucketStarts(
			data.range,
			new Date(data.from),
			new Date(data.to),
		);
		const points = starts.map((start) => {
			const row = byKey.get(format(start, "yyyy-MM-dd"));
			return {
				label:
					data.range === "12m"
						? format(start, "MMM yy", { locale: frLocale })
						: format(start, "dd/MM", { locale: frLocale }),
				revenue: row?.revenue ?? 0,
				count: row?.count ?? 0,
			};
		});
		const weekdayMap = new Map(
			data.weekdayPattern.map((w) => [w.day, w.count]),
		);
		const weekdays = WEEKDAY_ORDER.map((day, idx) => ({
			day,
			count: weekdayMap.get(idx) ?? 0,
		}));
		return { points, weekdays };
	}, [data]);
}

export const Route = createFileRoute("/admin/_layout/statistiques")({
	loader: async ({ context: { queryClient } }) => {
		await queryClient.prefetchQuery({
			queryKey: queryKeys.stats.all("30d"),
			queryFn: () => getStatsData({ data: "30d" }),
		});
	},
	component: RouteComponent,
});

function RouteComponent() {
	const [range, setRange] = useState<StatsRange>("30d");

	const { data, isPending } = useQuery({
		queryKey: queryKeys.stats.all(range),
		queryFn: () => getStatsData({ data: range }),
	});

	const { points, weekdays } = useSeries(data);

	const statusData = useMemo(() => {
		const all = [
			"PENDING_VERIFICATION",
			"CONFIRMED",
			"COLLECTED",
			"RETURNED",
			"CANCELLED",
			"EXPIRED",
		];
		const map = new Map(
			(data?.statusDistribution ?? []).map((s) => [s.status, s.count]),
		);
		return all
			.filter((s) => (map.get(s) ?? 0) > 0)
			.map((s, idx) => ({
				key: s,
				label: STATUS_LABELS[s] ?? s,
				value: map.get(s) ?? 0,
				color: PALETTE[idx % PALETTE.length],
			}));
	}, [data]);

	const categoryData = useMemo(
		() =>
			(data?.revenueByCategory ?? []).map((c, idx) => ({
				key: c.categoryName,
				label: c.categoryName,
				value: c.revenue,
				color: PALETTE[idx % PALETTE.length],
			})),
		[data],
	);

	const statusConfig = useMemo(
		() =>
			Object.fromEntries(
				statusData.map((s) => [s.key, { label: s.label, color: s.color }]),
			) satisfies ChartConfig,
		[statusData],
	);

	const categoryConfig = useMemo(
		() =>
			Object.fromEntries(
				categoryData.map((c) => [c.key, { label: c.label, color: c.color }]),
			) satisfies ChartConfig,
		[categoryData],
	);

	const topItems = data?.topItems ?? [];
	const seriesConfig = {
		revenue: { label: "Revenus", color: "#2563eb" },
		count: { label: "Réservations", color: "#10b981" },
	} satisfies ChartConfig;

	return (
		<>
			<SiteHeader title="Statistiques" />
			<div className="@container/main flex flex-1 flex-col gap-2">
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 className="text-lg font-semibold">Activité de location</h2>
							<p className="text-sm text-muted-foreground">
								Période analysée :{" "}
								{data ? format(new Date(data.from), "dd/MM/yyyy") : "…"} →{" "}
								{data ? format(new Date(data.to), "dd/MM/yyyy") : "…"}
							</p>
						</div>
						<div className="flex w-fit items-center gap-1 rounded-md border bg-muted/40 p-1">
							{RANGE_OPTIONS.map(({ key, label }) => (
								<button
									key={key}
									type="button"
									onClick={() => setRange(key)}
									className={cn(
										"rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
										range === key
											? "bg-background shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{label}
								</button>
							))}
						</div>
					</div>

					{isPending && !data ? (
						<div className="text-sm text-muted-foreground">Chargement...</div>
					) : (
						<>
							<div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs @xl:grid-cols-2 @5xl:grid-cols-4">
								<KpiCard
									label="Chiffre d'affaires"
									value={
										data
											? `${Math.round(data.kpis.totalRevenue).toLocaleString("fr-FR")} €`
											: "—"
									}
								/>
								<KpiCard
									label="Réservations"
									value={
										data
											? data.kpis.totalReservations.toLocaleString("fr-FR")
											: "—"
									}
								/>
								<KpiCard
									label="Durée moyenne"
									value={
										data
											? `${data.kpis.avgDurationDays.toLocaleString("fr-FR")} j`
											: "—"
									}
								/>
								<KpiCard
									label="Taux d'occupation"
									value={
										data
											? `${data.kpis.occupancyRate.toLocaleString("fr-FR")} %`
											: "—"
									}
								/>
							</div>

							<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
								<Card className="xl:col-span-2">
									<CardHeader>
										<CardTitle>Revenus sur la période</CardTitle>
										<CardDescription>
											Chiffre d'affaires des locations retournées
										</CardDescription>
									</CardHeader>
									<CardContent>
										<ChartContainer
											config={seriesConfig}
											className="aspect-auto h-[280px] w-full"
										>
											<AreaChart data={points} margin={{ left: 4, right: 4 }}>
												<CartesianGrid vertical={false} />
												<XAxis
													dataKey="label"
													tickLine={false}
													axisLine={false}
													tickMargin={8}
												/>
												<YAxis tickLine={false} axisLine={false} width={48} />
												<ChartTooltip
													cursor={false}
													content={
														<ChartTooltipContent
															formatter={(v) => euro(Number(v))}
														/>
													}
												/>
												<Area
													dataKey="revenue"
													type="monotone"
													fill="var(--color-revenue)"
													fillOpacity={0.2}
													stroke="var(--color-revenue)"
													strokeWidth={2}
												/>
											</AreaChart>
										</ChartContainer>
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<CardTitle>Réservations sur la période</CardTitle>
										<CardDescription>
											Locations hors annulations
										</CardDescription>
									</CardHeader>
									<CardContent>
										<ChartContainer
											config={seriesConfig}
											className="aspect-auto h-[260px] w-full"
										>
											<BarChart data={points} margin={{ left: 4, right: 4 }}>
												<CartesianGrid vertical={false} />
												<XAxis
													dataKey="label"
													tickLine={false}
													axisLine={false}
													tickMargin={8}
												/>
												<YAxis
													tickLine={false}
													axisLine={false}
													width={40}
													allowDecimals={false}
												/>
												<ChartTooltip
													cursor={false}
													content={<ChartTooltipContent />}
												/>
												<Bar
													dataKey="count"
													fill="var(--color-count)"
													radius={4}
												/>
											</BarChart>
										</ChartContainer>
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<CardTitle>Top 5 matériel loué</CardTitle>
										<CardDescription>
											Quantité réservée et revenus générés
										</CardDescription>
									</CardHeader>
									<CardContent>
										<ChartContainer
											config={{
												rentals: { label: "Locations", color: "#0ea5e9" },
											}}
											className="aspect-auto h-[260px] w-full"
										>
											<BarChart
												data={topItems}
												layout="vertical"
												margin={{ left: 8, right: 8 }}
											>
												<CartesianGrid horizontal={false} />
												<XAxis
													type="number"
													tickLine={false}
													axisLine={false}
													allowDecimals={false}
												/>
												<YAxis
													type="category"
													dataKey="itemName"
													tickLine={false}
													axisLine={false}
													width={150}
													tick={{ fontSize: 12 }}
												/>
												<ChartTooltip
													cursor={false}
													content={
														<ChartTooltipContent
															formatter={(value, name, item) =>
																name === "rentals"
																	? [
																			`${value} unité(s) · ${euro(
																				Number(item.payload?.revenue ?? 0),
																			)}`,
																			"Locations",
																		]
																	: [value, name]
															}
														/>
													}
												/>
												<Bar
													dataKey="rentals"
													fill="var(--color-rentals)"
													radius={4}
													barSize={22}
												/>
											</BarChart>
										</ChartContainer>
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<CardTitle>Répartition par statut</CardTitle>
										<CardDescription>
											État des réservations de la période
										</CardDescription>
									</CardHeader>
									<CardContent>
										<ChartContainer
											config={statusConfig}
											className="aspect-auto h-[260px] w-full"
										>
											<PieChart>
												<Pie
													data={statusData}
													dataKey="value"
													nameKey="key"
													innerRadius={55}
													outerRadius={90}
												>
													{statusData.map((entry) => (
														<Cell key={entry.key} fill={entry.color} />
													))}
												</Pie>
												<ChartTooltip
													content={<ChartTooltipContent hideLabel />}
												/>
												<ChartLegend
													content={<ChartLegendContent nameKey="key" />}
												/>
											</PieChart>
										</ChartContainer>
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<CardTitle>Distribution des durées</CardTitle>
										<CardDescription>
											Durée de location en jours complets
										</CardDescription>
									</CardHeader>
									<CardContent>
										<ChartContainer
											config={{
												count: { label: "Locations", color: "#f59e0b" },
											}}
											className="aspect-auto h-[200px] w-full"
										>
											<BarChart
												data={data?.durationDistribution ?? []}
												margin={{ left: 4, right: 4 }}
											>
												<CartesianGrid vertical={false} />
												<XAxis
													dataKey="days"
													tickLine={false}
													axisLine={false}
													tickMargin={8}
													tickFormatter={(d) => `${d} j`}
												/>
												<YAxis
													tickLine={false}
													axisLine={false}
													width={36}
													allowDecimals={false}
												/>
												<ChartTooltip
													cursor={false}
													content={
														<ChartTooltipContent
															labelFormatter={(l) => `${l} jour(s)`}
														/>
													}
												/>
												<Bar
													dataKey="count"
													fill="var(--color-count)"
													radius={4}
													barSize={36}
												/>
											</BarChart>
										</ChartContainer>
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<CardTitle>Revenus par catégorie</CardTitle>
										<CardDescription>
											Locations retournées uniquement
										</CardDescription>
									</CardHeader>
									<CardContent>
										{categoryData.length === 0 ? (
											<div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
												Aucun revenu sur la période
											</div>
										) : (
											<ChartContainer
												config={categoryConfig}
												className="aspect-auto h-[200px] w-full"
											>
												<PieChart>
													<Pie
														data={categoryData}
														dataKey="value"
														nameKey="key"
														innerRadius={50}
														outerRadius={80}
													>
														{categoryData.map((entry) => (
															<Cell key={entry.key} fill={entry.color} />
														))}
													</Pie>
													<ChartTooltip
														content={
															<ChartTooltipContent
																hideLabel
																formatter={(v) => euro(Number(v))}
															/>
														}
													/>
													<ChartLegend
														content={<ChartLegendContent nameKey="key" />}
													/>
												</PieChart>
											</ChartContainer>
										)}
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<CardTitle>Locations par jour de la semaine</CardTitle>
										<CardDescription>
											Quand les clients viennent chercher leur matériel
										</CardDescription>
									</CardHeader>
									<CardContent>
										<ChartContainer
											config={{
												count: { label: "Locations", color: "#8b5cf6" },
											}}
											className="aspect-auto h-[200px] w-full"
										>
											<BarChart data={weekdays} margin={{ left: 4, right: 4 }}>
												<CartesianGrid vertical={false} />
												<XAxis
													dataKey="day"
													tickLine={false}
													axisLine={false}
													tickMargin={8}
												/>
												<YAxis
													tickLine={false}
													axisLine={false}
													width={36}
													allowDecimals={false}
												/>
												<ChartTooltip
													cursor={false}
													content={
														<ChartTooltipContent
															labelFormatter={(d) => {
																const names = [
																	"Dimanche",
																	"Lundi",
																	"Mardi",
																	"Mercredi",
																	"Jeudi",
																	"Vendredi",
																	"Samedi",
																];
																const idx = WEEKDAY_ORDER.indexOf(String(d));
																return names[idx] ?? String(d);
															}}
														/>
													}
												/>
												<Bar
													dataKey="count"
													fill="var(--color-count)"
													radius={4}
													barSize={28}
												/>
											</BarChart>
										</ChartContainer>
									</CardContent>
								</Card>
							</div>
						</>
					)}
				</div>
			</div>
		</>
	);
}
