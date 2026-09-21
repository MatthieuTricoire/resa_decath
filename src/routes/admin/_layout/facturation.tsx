import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KpiCard } from "#/components/kpi-card";
import { SiteHeader } from "#/components/site-header";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Field, FieldContent, FieldLabel } from "#/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "#/components/ui/input-group";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import {
	getMonthlyBilling,
	updateBillingSettings,
} from "#/features/billing/queries";
import { queryKeys } from "#/features/billing/query-keys";
import { cn } from "#/lib/utils";
import { Route as AdminLayoutRoute } from "../_layout";

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
	const queryClient = useQueryClient();
	const { user } = AdminLayoutRoute.useLoaderData();
	const isAdmin = user?.role === "admin";

	const { data, isPending } = useQuery({
		queryKey: queryKeys.billing.monthly,
		queryFn: () => getMonthlyBilling(),
	});

	const [fee, setFee] = useState("");
	const [rate, setRate] = useState("");

	useEffect(() => {
		if (!data) return;
		setFee(String(data.settings.monthlyFee));
		setRate(String(data.settings.commissionRate));
	}, [data]);

	const current = data?.months[data.months.length - 1];

	const totals = useMemo(() => {
		if (!data) return { revenue: 0, commission: 0, totalDue: 0 };
		return data.months.reduce(
			(acc, m) => ({
				revenue: acc.revenue + m.revenue,
				commission: acc.commission + m.commission,
				totalDue: acc.totalDue + m.totalDue,
			}),
			{ revenue: 0, commission: 0, totalDue: 0 },
		);
	}, [data]);

	const saveMutation = useMutation({
		mutationFn: (input: { monthlyFee: number; commissionRate: number }) =>
			updateBillingSettings({ data: input }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.billing.monthly });
			toast.success("Tarification enregistrée.");
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Erreur"),
	});

	const handleSave = () => {
		const monthlyFee = Number.parseFloat(fee);
		const commissionRate = Number.parseFloat(rate);
		if (Number.isNaN(monthlyFee) || monthlyFee < 0) {
			toast.error("Forfait mensuel invalide.");
			return;
		}
		if (
			Number.isNaN(commissionRate) ||
			commissionRate < 0 ||
			commissionRate > 100
		) {
			toast.error("La commission doit être comprise entre 0 et 100 %.");
			return;
		}
		saveMutation.mutate({ monthlyFee, commissionRate });
	};

	return (
		<>
			<SiteHeader title="Facturation" />
			<div className="@container/main flex flex-1 flex-col gap-2">
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
					<div>
						<h2 className="text-lg font-semibold">Suivi de la facturation</h2>
						<p className="text-sm text-muted-foreground">
							Montant à verser = forfait mensuel + commission du chiffre
							d'affaires des locations retournées.
						</p>
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
													primary: `Forfait ${euro(current.monthlyFee)} € + commission ${data?.settings.commissionRate} % du CA`,
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
													primary: `${current.reservationCount.toLocaleString("fr-FR")} locations retournées`,
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
													primary: `${data?.settings.commissionRate} % du CA · soit ${euro(current.commission)} €`,
												}
											: undefined
									}
								/>
							</div>

							{isAdmin ? (
								<Card>
									<CardHeader>
										<CardTitle>Tarification de la plateforme</CardTitle>
										<CardDescription>
											Montants appliqués pour le calcul mensuel (rétroactifs sur
											toute la période affichée).
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="flex flex-col gap-6 md:flex-row md:items-end md:gap-8">
											<Field orientation="horizontal">
												<FieldLabel>Forfait mensuel</FieldLabel>
												<FieldContent>
													<InputGroup className="w-40">
														<InputGroupInput
															type="number"
															min={0}
															step="0.01"
															inputMode="decimal"
															value={fee}
															onChange={(e) => setFee(e.target.value)}
														/>
														<InputGroupAddon align="inline-end">
															€
														</InputGroupAddon>
													</InputGroup>
												</FieldContent>
											</Field>
											<Field orientation="horizontal">
												<FieldLabel>Commission</FieldLabel>
												<FieldContent>
													<InputGroup className="w-32">
														<InputGroupInput
															type="number"
															min={0}
															max={100}
															step="0.01"
															inputMode="decimal"
															value={rate}
															onChange={(e) => setRate(e.target.value)}
														/>
														<InputGroupAddon align="inline-end">
															%
														</InputGroupAddon>
													</InputGroup>
												</FieldContent>
											</Field>
											<Button
												type="button"
												onClick={handleSave}
												disabled={saveMutation.isPending}
												className="md:ml-auto"
											>
												<Save />
												Enregistrer
											</Button>
										</div>
									</CardContent>
								</Card>
							) : (
								<Card>
									<CardContent className="py-6">
										<p className="text-sm text-muted-foreground">
											Les paramètres de tarification de la plateforme (forfait
											mensuel et commission) sont réservés à l'administrateur.
										</p>
									</CardContent>
								</Card>
							)}

							<Card>
								<CardHeader>
									<CardTitle>Détail mensuel</CardTitle>
									<CardDescription>
										Les 12 derniers mois de locations retournées
									</CardDescription>
								</CardHeader>
								<CardContent>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Mois</TableHead>
												<TableHead className="text-right">CA</TableHead>
												<TableHead className="text-right">Locations</TableHead>
												<TableHead className="text-right">
													Commission ({data?.settings.commissionRate} %)
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
															{euro(m.revenue)} €
														</TableCell>
														<TableCell className="text-right tabular-nums">
															{m.reservationCount}
														</TableCell>
														<TableCell className="text-right tabular-nums">
															{euro(m.commission)} €
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
													{euro(totals.revenue)} €
												</TableCell>
												<TableCell />
												<TableCell className="text-right tabular-nums">
													{euro(totals.commission)} €
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
