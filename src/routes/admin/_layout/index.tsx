import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format, startOfDay } from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import { AlertTriangle, Check, Eye, Undo2, X } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { KpiCard } from "#/components/kpi-card";
import { SiteHeader } from "#/components/site-header";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import {
	getDashboardKPIs,
	getTodaySchedule,
	type TodayReservationRow,
	updateReservationStatus,
} from "#/features/reservations/queries";
import { queryKeys } from "#/features/reservations/query-keys";

const formatDateTime = (iso: string) =>
	format(new Date(iso), "dd/MM/yy HH:mm", { locale: frLocale });

function daysLate(iso: string) {
	const diff =
		startOfDay(new Date()).getTime() - startOfDay(new Date(iso)).getTime();
	return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function lateLabel(iso: string, days: number = daysLate(iso)) {
	return days <= 1 ? "il y a 1 jour" : `il y a ${days} jours`;
}

function LateSection({
	title,
	rows,
	dateField,
	renderAction,
	emptyLabel,
}: {
	title: string;
	rows: TodayReservationRow[];
	dateField: "pickupDate" | "returnDate";
	renderAction: (row: TodayReservationRow) => ReactNode;
	emptyLabel: string;
}) {
	return (
		<div className="overflow-hidden rounded-md border border-red-200 bg-white dark:border-red-900 dark:bg-card">
			<div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-900 dark:bg-red-950/40">
				<div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
					<AlertTriangle className="size-4" />
					{title}
				</div>
				{rows.length > 0 && (
					<Badge className="bg-red-600 text-white">{rows.length}</Badge>
				)}
			</div>
			<Table>
				<TableHeader className="bg-muted/50">
					<TableRow>
						<TableHead>Client</TableHead>
						<TableHead>Prévu</TableHead>
						<TableHead>Articles</TableHead>
						<TableHead className="w-20" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={4}
								className="text-center text-sm text-muted-foreground"
							>
								{emptyLabel}
							</TableCell>
						</TableRow>
					) : (
						rows.map((r) => (
							<TableRow key={r.id}>
								<TableCell>
									<div className="text-sm font-medium">{r.clientName}</div>
									<div className="text-xs text-muted-foreground">
										{r.clientEmail}
									</div>
								</TableCell>
								<TableCell>
									<div className="text-sm whitespace-nowrap">
										{formatDateTime(r[dateField])}
									</div>
									<Badge className="mt-1 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
										{lateLabel(r[dateField])}
									</Badge>
								</TableCell>
								<TableCell className="text-sm">{r.itemCount}</TableCell>
								<TableCell>
									<div className="flex items-center gap-1">
										{renderAction(r)}
									</div>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}

export const Route = createFileRoute("/admin/_layout/")({
	loader: async ({ context: { queryClient } }) => {
		await Promise.all([
			queryClient.prefetchQuery({
				queryKey: queryKeys.dashboard.kpis,
				queryFn: () => getDashboardKPIs(),
			}),
			queryClient.prefetchQuery({
				queryKey: queryKeys.dashboard.todaySchedule,
				queryFn: () => getTodaySchedule(),
			}),
		]);
	},
	component: RouteComponent,
});

function RouteComponent() {
	const queryClient = useQueryClient();

	const { data: kpis } = useQuery({
		queryKey: queryKeys.dashboard.kpis,
		queryFn: () => getDashboardKPIs(),
	});

	const { data: schedule } = useQuery({
		queryKey: queryKeys.dashboard.todaySchedule,
		queryFn: () => getTodaySchedule(),
	});

	const pickupMutation = useMutation({
		mutationFn: (id: string) =>
			updateReservationStatus({
				data: { id, status: "COLLECTED" },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.kpis });
			queryClient.invalidateQueries({
				queryKey: queryKeys.dashboard.todaySchedule,
			});
			toast.success("Location récupérée");
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Erreur lors de la récupération",
			);
		},
	});

	const returnMutation = useMutation({
		mutationFn: (id: string) =>
			updateReservationStatus({
				data: { id, status: "RETURNED" },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.kpis });
			queryClient.invalidateQueries({
				queryKey: queryKeys.dashboard.todaySchedule,
			});
			toast.success("Location retournée");
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Erreur lors du retour");
		},
	});

	const cancelMutation = useMutation({
		mutationFn: (id: string) =>
			updateReservationStatus({
				data: { id, status: "CANCELLED" },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.kpis });
			queryClient.invalidateQueries({
				queryKey: queryKeys.dashboard.todaySchedule,
			});
			toast.success("Réservation annulée, matériel libéré");
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Erreur lors de l'annulation",
			);
		},
	});

	const overdueReturns = schedule?.overdueReturns ?? [];
	const expiredPickups = schedule?.expiredPickups ?? [];
	const hasAlerts = overdueReturns.length > 0 || expiredPickups.length > 0;

	return (
		<>
			<SiteHeader title="Dashboard" />
			<div className="@container/main flex flex-1 flex-col gap-2">
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
					{hasAlerts && (
						<div className="flex flex-col gap-3 rounded-lg border-2 border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/20">
							<div className="flex items-center gap-2 px-1">
								<AlertTriangle className="size-4 text-red-600 dark:text-red-400" />
								<h3 className="text-sm font-semibold text-red-700 dark:text-red-400">
									Retards à gérer
								</h3>
								<Badge className="bg-red-600 text-white">
									{overdueReturns.length + expiredPickups.length}
								</Badge>
							</div>
							{overdueReturns.length > 0 && (
								<LateSection
									title="Retours en retard"
									rows={overdueReturns}
									dateField="returnDate"
									emptyLabel="Aucun retour en retard"
									renderAction={(r) => (
										<>
											<Button
												variant="ghost"
												size="icon"
												className="size-7"
												asChild
											>
												<Link
													to="/admin/reservations/$reservationId"
													params={{ reservationId: r.id }}
												>
													<Eye className="size-3.5" />
												</Link>
											</Button>
											<Button
												variant="outline"
												size="sm"
												className="size-7 p-0"
												disabled={returnMutation.isPending}
												onClick={() => returnMutation.mutate(r.id)}
												title="Marquer comme retourné"
											>
												<Undo2 className="size-3.5" />
											</Button>
										</>
									)}
								/>
							)}
							{expiredPickups.length > 0 && (
								<LateSection
									title="Retraits dépassés — matériel à libérer"
									rows={expiredPickups}
									dateField="pickupDate"
									emptyLabel="Aucun retrait dépassé"
									renderAction={(r) => (
										<>
											<Button
												variant="ghost"
												size="icon"
												className="size-7"
												asChild
											>
												<Link
													to="/admin/reservations/$reservationId"
													params={{ reservationId: r.id }}
												>
													<Eye className="size-3.5" />
												</Link>
											</Button>
											<Button
												variant="outline"
												size="sm"
												className="size-7 p-0"
												disabled={cancelMutation.isPending}
												onClick={() => cancelMutation.mutate(r.id)}
												title="Annuler et libérer le matériel"
											>
												<X className="size-3.5" />
											</Button>
										</>
									)}
								/>
							)}
						</div>
					)}
					<div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl:grid-cols-2 @5xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
						<KpiCard
							label="Réservations du jour"
							value={kpis?.todayCount ?? "—"}
						/>
						<KpiCard label="En cours" value={kpis?.activeCount ?? "—"} />
						<KpiCard
							label="Revenu du mois"
							value={
								kpis?.monthlyRevenue
									? `${Number(kpis.monthlyRevenue).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`
									: "—"
							}
						/>
						<KpiCard label="À récupérer" value={kpis?.pendingPickup ?? "—"} />
					</div>

					<div className="grid grid-cols-1 gap-4 @5xl:grid-cols-2">
						<div className="rounded-md border">
							<div className="flex items-center justify-between px-4 py-3 border-b">
								<h3 className="text-sm font-medium">À récupérer aujourd'hui</h3>
								{schedule && schedule.pickups.length > 0 && (
									<Badge variant="outline">{schedule.pickups.length}</Badge>
								)}
							</div>
							<Table>
								<TableHeader className="bg-muted/50">
									<TableRow>
										<TableHead>Client</TableHead>
										<TableHead>Heure</TableHead>
										<TableHead>Articles</TableHead>
										<TableHead className="w-20" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{!schedule ? (
										<TableRow>
											<TableCell
												colSpan={5}
												className="text-center text-sm text-muted-foreground"
											>
												Chargement...
											</TableCell>
										</TableRow>
									) : schedule.pickups.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={5}
												className="text-center text-sm text-muted-foreground"
											>
												Aucune réservation à récupérer aujourd'hui
											</TableCell>
										</TableRow>
									) : (
										schedule.pickups.map((r) => (
											<TableRow key={r.id}>
												<TableCell>
													<div className="text-sm font-medium">
														{r.clientName}
													</div>
													<div className="text-xs text-muted-foreground">
														{r.clientEmail}
													</div>
												</TableCell>
												<TableCell className="text-sm">{r.time}</TableCell>
												<TableCell className="text-sm">{r.itemCount}</TableCell>
												<TableCell>
													<div className="flex items-center gap-1">
														<Button
															variant="ghost"
															size="icon"
															className="size-7"
															asChild
														>
															<Link
																to="/admin/reservations/$reservationId"
																params={{ reservationId: r.id }}
															>
																<Eye className="size-3.5" />
															</Link>
														</Button>
														<Button
															variant="outline"
															size="sm"
															className="size-7 p-0"
															disabled={pickupMutation.isPending}
															onClick={() => pickupMutation.mutate(r.id)}
															title="Marquer comme récupéré"
														>
															<Check className="size-3.5" />
														</Button>
													</div>
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</div>

						<div className="rounded-md border">
							<div className="flex items-center justify-between px-4 py-3 border-b">
								<h3 className="text-sm font-medium">À rendre aujourd'hui</h3>
								{schedule && schedule.returns.length > 0 && (
									<Badge variant="outline">{schedule.returns.length}</Badge>
								)}
							</div>
							<Table>
								<TableHeader className="bg-muted/50">
									<TableRow>
										<TableHead>Client</TableHead>
										<TableHead>Heure</TableHead>
										<TableHead>Articles</TableHead>
										<TableHead className="w-20" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{!schedule ? (
										<TableRow>
											<TableCell
												colSpan={5}
												className="text-center text-sm text-muted-foreground"
											>
												Chargement...
											</TableCell>
										</TableRow>
									) : schedule.returns.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={5}
												className="text-center text-sm text-muted-foreground"
											>
												Aucune réservation à rendre aujourd'hui
											</TableCell>
										</TableRow>
									) : (
										schedule.returns.map((r) => (
											<TableRow key={r.id}>
												<TableCell>
													<div className="text-sm font-medium">
														{r.clientName}
													</div>
													<div className="text-xs text-muted-foreground">
														{r.clientEmail}
													</div>
												</TableCell>
												<TableCell className="text-sm">{r.time}</TableCell>
												<TableCell className="text-sm">{r.itemCount}</TableCell>
												<TableCell>
													<div className="flex items-center gap-1">
														<Button
															variant="ghost"
															size="icon"
															className="size-7"
															asChild
														>
															<Link
																to="/admin/reservations/$reservationId"
																params={{ reservationId: r.id }}
															>
																<Eye className="size-3.5" />
															</Link>
														</Button>
														<Button
															variant="outline"
															size="sm"
															className="size-7 p-0"
															disabled={returnMutation.isPending}
															onClick={() => returnMutation.mutate(r.id)}
															title="Marquer comme retourné"
														>
															<Undo2 className="size-3.5" />
														</Button>
													</div>
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
