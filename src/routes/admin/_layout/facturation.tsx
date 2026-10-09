import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
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
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { getMonthlyBilling } from "#/features/billing/queries";
import { queryKeys } from "#/features/billing/query-keys";
import { cn } from "#/lib/utils";

const euro = (n: number) =>
	n.toLocaleString("fr-FR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

export const Route = createFileRoute("/admin/_layout/facturation")({
	loader: async ({ context: { queryClient } }) => {
		await queryClient.prefetchQuery({
			queryKey: queryKeys.billing.monthly,
			queryFn: () => getMonthlyBilling(),
		});
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { data, isPending } = useQuery({
		queryKey: queryKeys.billing.monthly,
		queryFn: () => getMonthlyBilling(),
	});

	const current = data?.months[data.months.length - 1];

	const totals = useMemo(() => {
		if (!data)
			return {
				revenue: 0,
				webRevenue: 0,
				storeRevenue: 0,
				webCommission: 0,
				storeCommission: 0,
				commission: 0,
				totalDue: 0,
			};
		return data.months.reduce(
			(acc, m) => ({
				revenue: acc.revenue + m.revenue,
				webRevenue: acc.webRevenue + m.webRevenue,
				storeRevenue: acc.storeRevenue + m.storeRevenue,
				webCommission: acc.webCommission + m.webCommission,
				storeCommission: acc.storeCommission + m.storeCommission,
				commission: acc.commission + m.commission,
				totalDue: acc.totalDue + m.totalDue,
			}),
			{
				revenue: 0,
				webRevenue: 0,
				storeRevenue: 0,
				webCommission: 0,
				storeCommission: 0,
				commission: 0,
				totalDue: 0,
			},
		);
	}, [data]);

	return (
		<>
			<SiteHeader title="Facturation" />
			<div className="@container/main flex flex-1 flex-col gap-2">
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
					<div>
						<h2 className="text-lg font-semibold">Suivi de la facturation</h2>
						<div className="flex flex-col gap-2">
							<p className="text-sm text-muted-foreground">
								Montant à verser = forfait mensuel + commissions distinctes sur
								le chiffre d’affaires web ({data?.settings.commissionRateWeb} %)
								et magasin ({data?.settings.commissionRateStore} %).
							</p>
							<Link
								to="/admin/reglages"
								hash="tarification"
								className="text-sm text-primary underline underline-offset-4"
							>
								Gérer la tarification dans Réglages
							</Link>
						</div>
					</div>

					{isPending && !data ? (
						<div className="text-sm text-muted-foreground">Chargement...</div>
					) : (
						<>
							<div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs @xl:grid-cols-2 @5xl:grid-cols-3">
								<KpiCard
									label="À verser ce mois-ci"
									value={`${current ? euro(current.totalDue) : "—"} €`}
									footer={
										current
											? {
													primary: `Forfait ${euro(current.monthlyFee)} € + comm. Web (${data?.settings.commissionRateWeb} %) & Magasin (${data?.settings.commissionRateStore} %)`,
												}
											: undefined
									}
								/>
								<KpiCard
									label="CA du mois"
									value={`${current ? euro(current.revenue) : "—"} €`}
									footer={
										current
											? {
													primary: `Web : ${euro(current.webRevenue)} € · Magasin : ${euro(current.storeRevenue)} € (${current.reservationCount} locations)`,
												}
											: undefined
									}
								/>
								<KpiCard
									label="Commission du mois"
									value={current ? `${euro(current.commission)} €` : "—"}
									footer={
										current
											? {
													primary: `Web : ${euro(current.webCommission)} € (${data?.settings.commissionRateWeb} %) · Magasin : ${euro(current.storeCommission)} € (${data?.settings.commissionRateStore} %)`,
												}
											: undefined
									}
								/>
							</div>

							<Card>
								<CardHeader>
									<CardTitle>Détail mensuel</CardTitle>
									<CardDescription>
										Les 12 derniers mois de locations retournées ventilées par
										canal
									</CardDescription>
								</CardHeader>
								<CardContent>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Mois</TableHead>
												<TableHead className="text-right">CA Total</TableHead>
												<TableHead className="text-right">Locations</TableHead>
												<TableHead className="text-right">
													Commission ({data?.settings.commissionRateWeb} % web ·{" "}
													{data?.settings.commissionRateStore} % mag.)
												</TableHead>
												<TableHead className="text-right">Forfait</TableHead>
												<TableHead className="text-right">
													Total à verser
												</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{data?.months.map((m, idx) => {
												const isCurrent = idx === data.months.length - 1;
												return (
													<TableRow
														key={m.month}
														className={cn(isCurrent && "bg-primary/5")}
													>
														<TableCell className="font-medium">
															<span className="capitalize">{m.label}</span>{" "}
															{isCurrent && (
																<Badge className="ml-1">En cours</Badge>
															)}
														</TableCell>
														<TableCell className="text-right tabular-nums">
															<div>{euro(m.revenue)} €</div>
															<div className="text-[11px] text-muted-foreground">
																Web {euro(m.webRevenue)} € · Mag.{" "}
																{euro(m.storeRevenue)} €
															</div>
														</TableCell>
														<TableCell className="text-right tabular-nums">
															<div>{m.reservationCount}</div>
															<div className="text-[11px] text-muted-foreground">
																{m.webReservationCount} web ·{" "}
																{m.storeReservationCount} mag.
															</div>
														</TableCell>
														<TableCell className="text-right tabular-nums">
															<div>{euro(m.commission)} €</div>
															<div className="text-[11px] text-muted-foreground">
																Web {euro(m.webCommission)} € + Mag.{" "}
																{euro(m.storeCommission)} €
															</div>
														</TableCell>
														<TableCell className="text-right tabular-nums">
															{euro(m.monthlyFee)} €
														</TableCell>
														<TableCell className="text-right font-semibold tabular-nums">
															{euro(m.totalDue)} €
														</TableCell>
													</TableRow>
												);
											})}
										</TableBody>
										<TableFooter>
											<TableRow>
												<TableCell>Total (12 mois)</TableCell>
												<TableCell className="text-right tabular-nums">
													<div>{euro(totals.revenue)} €</div>
													<div className="text-[11px] text-muted-foreground font-normal">
														Web {euro(totals.webRevenue)} € · Mag.{" "}
														{euro(totals.storeRevenue)} €
													</div>
												</TableCell>
												<TableCell />
												<TableCell className="text-right tabular-nums">
													<div>{euro(totals.commission)} €</div>
													<div className="text-[11px] text-muted-foreground font-normal">
														Web {euro(totals.webCommission)} € · Mag.{" "}
														{euro(totals.storeCommission)} €
													</div>
												</TableCell>
												<TableCell />
												<TableCell className="text-right tabular-nums">
													{euro(totals.totalDue)} €
												</TableCell>
											</TableRow>
										</TableFooter>
									</Table>
								</CardContent>
							</Card>
						</>
					)}
				</div>
			</div>
		</>
	);
}
