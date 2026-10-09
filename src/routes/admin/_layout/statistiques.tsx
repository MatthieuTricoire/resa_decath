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
import { Badge } from "#/components/ui/badge";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
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

	const categoryConfig = useMemo(
		() =>
			Object.fromEntries(
				categoryData.map((c) => [c.key, { label: c.label, color: c.color }]),
			) satisfies ChartConfig,
		[categoryData],
	);

	const rentedItems = useMemo(() => data?.rentedItems ?? [], [data]);
	const totalUnitsRented = useMemo(
		() => rentedItems.reduce((acc, item) => acc + item.rentals, 0),
		[rentedItems],
	);

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
							<div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs @xl:grid-cols-3 @5xl:grid-cols-5">
								<KpiCard
									label="Chiffre d'affaires"
									value={
										data
											? `${Math.round(data.kpis.totalRevenue).toLocaleString("fr-FR")} €`
											: "—"
									}
									footer={
										data && data.kpis.totalRevenue > 0
											? {
													primary: `En ligne : ${euro(data.kpis.webRevenue)} € · Magasin : ${euro(data.kpis.storeRevenue)} €`,
													secondary: `${Math.round((data.kpis.webRevenue / data.kpis.totalRevenue) * 100)} % en ligne · ${Math.round((data.kpis.storeRevenue / data.kpis.totalRevenue) * 100)} % magasin`,
												}
											: undefined
									}
								/>
								<KpiCard
									label="Réservations"
									value={
										data
											? data.kpis.totalReservations.toLocaleString("fr-FR")
											: "—"
									}
									footer={
										data && data.kpis.totalReservations > 0
											? {
													primary: `${data.kpis.webReservations} en ligne · ${data.kpis.storeReservations} magasin`,
													secondary: `${Math.round((data.kpis.webReservations / data.kpis.totalReservations) * 100)} % en ligne · ${Math.round((data.kpis.storeReservations / data.kpis.totalReservations) * 100)} % magasin`,
												}
											: undefined
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
								<KpiCard
									label="Non présentés"
									value={data ? data.kpis.noShows.toLocaleString("fr-FR") : "—"}
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

								<Card className="xl:col-span-2">
									<CardHeader>
										<CardTitle>Classement des équipements loués</CardTitle>
										<CardDescription>
											Tous les équipements réservés sur la période (
											{rentedItems.length} référence
											{rentedItems.length > 1 ? "s" : ""})
										</CardDescription>
									</CardHeader>
									<CardContent>
										{rentedItems.length === 0 ? (
											<div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
												Aucun équipement loué sur la période
											</div>
										) : (
											<div className="max-h-[460px] overflow-auto rounded-md border">
												<Table>
													<TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-xs">
														<TableRow>
															<TableHead className="w-16 text-center">
																Rang
															</TableHead>
															<TableHead>Équipement</TableHead>
															<TableHead>Catégorie</TableHead>
															<TableHead className="text-right">
																Locations
															</TableHead>
															<TableHead className="text-right">
																Part du total
															</TableHead>
															<TableHead className="text-right">
																Chiffre d’affaires
															</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{rentedItems.map((item, idx) => {
															const rank = idx + 1;
															const sharePct =
																totalUnitsRented > 0
																	? (item.rentals / totalUnitsRented) * 100
																	: 0;
															const formattedPct =
																sharePct >= 10
																	? `${Math.round(sharePct)} %`
																	: `${sharePct.toLocaleString("fr-FR", {
																			minimumFractionDigits: 1,
																			maximumFractionDigits: 1,
																		})} %`;
															return (
																<TableRow key={item.itemId}>
																	<TableCell className="text-center font-medium">
																		{rank === 1 ? (
																			<Badge className="bg-amber-500 font-bold text-white hover:bg-amber-600">
																				#1
																			</Badge>
																		) : rank === 2 ? (
																			<Badge className="bg-slate-400 font-bold text-white hover:bg-slate-500">
																				#2
																			</Badge>
																		) : rank === 3 ? (
																			<Badge className="bg-amber-700 font-bold text-white hover:bg-amber-800">
																				#3
																			</Badge>
																		) : (
																			<span className="text-muted-foreground">
																				#{rank}
																			</span>
																		)}
																	</TableCell>
																	<TableCell className="font-medium">
																		{item.itemName}
																	</TableCell>
																	<TableCell className="text-muted-foreground">
																		{item.categoryName ?? "—"}
																	</TableCell>
																	<TableCell className="text-right tabular-nums font-semibold">
																		{item.rentals.toLocaleString("fr-FR")}
																	</TableCell>
																	<TableCell className="text-right tabular-nums text-muted-foreground">
																		{formattedPct}
																	</TableCell>
																	<TableCell className="text-right tabular-nums font-medium">
																		{euro(item.revenue)} €
																	</TableCell>
																</TableRow>
															);
														})}
													</TableBody>
												</Table>
											</div>
										)}
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
