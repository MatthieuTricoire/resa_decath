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
import { Card, CardContent } from "#/components/ui/card";
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

function MobileReservationList({
	rows,
	isLoading = false,
	emptyLabel,
	renderDetails,
	renderActions,
}: {
	rows: TodayReservationRow[];
	isLoading?: boolean;
	emptyLabel: string;
	renderDetails: (row: TodayReservationRow) => ReactNode;
	renderActions: (row: TodayReservationRow) => ReactNode;
}) {
	if (isLoading || rows.length === 0) {
		return (
			<div className="p-3 md:hidden">
				<Card className="gap-3 rounded-lg bg-background py-3 shadow-none">
					<CardContent
						className="px-3 text-center text-sm text-muted-foreground"
						role={isLoading ? "status" : undefined}
					>
						{isLoading ? "Chargement..." : emptyLabel}
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<ul className="m-0 grid list-none gap-2 p-3 md:hidden">
			{rows.map((row) => (
				<li key={row.id}>
					<Card className="gap-3 rounded-lg bg-background py-3 shadow-none">
						<CardContent className="space-y-3 px-3">
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">{row.clientName}</p>
								<p className="break-all text-xs text-muted-foreground">
									{row.clientEmail}
								</p>
							</div>
							<div className="flex flex-wrap items-end justify-between gap-3">
								<div className="min-w-0">{renderDetails(row)}</div>
								<div className="flex shrink-0 items-center gap-2">
									{renderActions(row)}
								</div>
							</div>
						</CardContent>
					</Card>
				</li>
			))}
		</ul>
	);
}

function ReservationActions({
	row,
	actionLabel,
	actionIcon,
	onAction,
	isPending,
}: {
	row: TodayReservationRow;
	actionLabel: (row: TodayReservationRow) => string;
	actionIcon: ReactNode;
	onAction: (id: string) => void;
	isPending: boolean;
}) {
	const accessibleActionLabel = actionLabel(row);

	return (
		<>
			<Button variant="ghost" size="icon-lg" asChild>
				<Link
					to="/admin/reservations/$reservationId"
					params={{ reservationId: row.id }}
					aria-label={`Voir la réservation de ${row.clientName}`}
					title="Voir la réservation"
				>
					<Eye className="size-4" />
				</Link>
			</Button>
			<Button
				type="button"
				variant="outline"
				size="icon-lg"
				disabled={isPending}
				onClick={() => onAction(row.id)}
				aria-label={accessibleActionLabel}
				title={accessibleActionLabel}
			>
				{actionIcon}
			</Button>
		</>
	);
}

function LateSection({
	titleId,
	title,
	rows,
	dateField,
	actionLabel,
	actionIcon,
	onAction,
	isActionPending,
}: {
	titleId: string;
	title: string;
	rows: TodayReservationRow[];
	dateField: "pickupDate" | "returnDate";
	actionLabel: (row: TodayReservationRow) => string;
	actionIcon: ReactNode;
	onAction: (id: string) => void;
	isActionPending: boolean;
}) {
	return (
		<section
			className="overflow-hidden rounded-md border border-red-200 bg-white dark:border-red-900 dark:bg-card"
			aria-labelledby={titleId}
		>
			<div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-900 dark:bg-red-950/40">
				<h3
					id={titleId}
					className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400"
				>
					<AlertTriangle className="size-4" />
					{title}
				</h3>
				<Badge className="bg-red-600 text-white">{rows.length}</Badge>
			</div>
			<MobileReservationList
				rows={rows}
				emptyLabel="Aucun retard"
				renderDetails={(row) => (
					<div className="space-y-1.5 text-sm">
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span className="text-xs text-muted-foreground">Prévu</span>
							<time dateTime={row[dateField]} className="font-medium">
								{formatDateTime(row[dateField])}
							</time>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-xs text-muted-foreground">Articles</span>
							<span className="font-medium tabular-nums">{row.itemCount}</span>
						</div>
						<Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
							{lateLabel(row[dateField])}
						</Badge>
					</div>
				)}
				renderActions={(row) => (
					<ReservationActions
						row={row}
						actionLabel={actionLabel}
						actionIcon={actionIcon}
						onAction={onAction}
						isPending={isActionPending}
					/>
				)}
			/>
			<div className="hidden md:block">
				<Table>
					<TableHeader className="bg-muted/50">
						<TableRow>
							<TableHead scope="col">Client</TableHead>
							<TableHead scope="col">Prévu</TableHead>
							<TableHead scope="col">Articles</TableHead>
							<TableHead scope="col" className="w-24">
								<span className="sr-only">Actions</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.id}>
								<TableCell>
									<div className="text-sm font-medium">{row.clientName}</div>
									<div className="text-xs text-muted-foreground">
										{row.clientEmail}
									</div>
								</TableCell>
								<TableCell>
									<div className="text-sm whitespace-nowrap">
										{formatDateTime(row[dateField])}
									</div>
									<Badge className="mt-1 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
										{lateLabel(row[dateField])}
									</Badge>
								</TableCell>
								<TableCell className="text-sm tabular-nums">
									{row.itemCount}
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-1">
										<ReservationActions
											row={row}
											actionLabel={actionLabel}
											actionIcon={actionIcon}
											onAction={onAction}
											isPending={isActionPending}
										/>
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</section>
	);
}

function ScheduleSection({
	id,
	title,
	rows,
	isLoading,
	emptyLabel,
	actionLabel,
	actionIcon,
	onAction,
	isActionPending,
}: {
	id: string;
	title: string;
	rows: TodayReservationRow[];
	isLoading: boolean;
	emptyLabel: string;
	actionLabel: (row: TodayReservationRow) => string;
	actionIcon: ReactNode;
	onAction: (id: string) => void;
	isActionPending: boolean;
}) {
	return (
		<section
			className="min-w-0 overflow-hidden rounded-md border bg-card"
			aria-labelledby={id}
		>
			<div className="flex items-center justify-between border-b px-4 py-3">
				<h2 id={id} className="text-sm font-medium">
					{title}
				</h2>
				{rows.length > 0 && <Badge variant="outline">{rows.length}</Badge>}
			</div>
			<MobileReservationList
				rows={rows}
				isLoading={isLoading}
				emptyLabel={emptyLabel}
				renderDetails={(row) => (
					<div className="space-y-1 text-sm">
						<div className="flex items-center gap-2">
							<span className="text-xs text-muted-foreground">Heure</span>
							<span className="font-semibold tabular-nums">{row.time}</span>
						</div>
						<p className="text-muted-foreground">
							{row.itemCount} article{row.itemCount > 1 ? "s" : ""}
						</p>
					</div>
				)}
				renderActions={(row) => (
					<ReservationActions
						row={row}
						actionLabel={actionLabel}
						actionIcon={actionIcon}
						onAction={onAction}
						isPending={isActionPending}
					/>
				)}
			/>
			<div className="hidden md:block">
				<Table>
					<TableHeader className="bg-muted/50">
						<TableRow>
							<TableHead scope="col">Client</TableHead>
							<TableHead scope="col">Heure</TableHead>
							<TableHead scope="col">Articles</TableHead>
							<TableHead scope="col" className="w-24">
								<span className="sr-only">Actions</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<TableRow>
								<TableCell
									colSpan={4}
									className="text-center text-sm text-muted-foreground"
								>
									Chargement...
								</TableCell>
							</TableRow>
						) : rows.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={4}
									className="text-center text-sm text-muted-foreground"
								>
									{emptyLabel}
								</TableCell>
							</TableRow>
						) : (
							rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										<div className="text-sm font-medium">{row.clientName}</div>
										<div className="text-xs text-muted-foreground">
											{row.clientEmail}
										</div>
									</TableCell>
									<TableCell className="text-sm tabular-nums">
										{row.time}
									</TableCell>
									<TableCell className="text-sm tabular-nums">
										{row.itemCount}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-1">
											<ReservationActions
												row={row}
												actionLabel={actionLabel}
												actionIcon={actionIcon}
												onAction={onAction}
												isPending={isActionPending}
											/>
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</section>
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
			<div className="@container/main flex min-w-0 flex-1 flex-col gap-2">
				<div className="flex min-w-0 flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
					{hasAlerts && (
						<div className="flex flex-col gap-3 rounded-lg border-2 border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/20">
							<div className="flex items-center gap-2 px-1">
								<AlertTriangle className="size-4 text-red-600 dark:text-red-400" />
								<h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
									Retards à gérer
								</h2>
								<Badge className="bg-red-600 text-white">
									{overdueReturns.length + expiredPickups.length}
								</Badge>
							</div>
							{overdueReturns.length > 0 && (
								<LateSection
									titleId="late-returns"
									title="Retours en retard"
									rows={overdueReturns}
									dateField="returnDate"
									actionLabel={(row) =>
										`Marquer le retour de ${row.clientName} comme effectué`
									}
									actionIcon={<Undo2 className="size-4" />}
									onAction={(id) => returnMutation.mutate(id)}
									isActionPending={returnMutation.isPending}
								/>
							)}
							{expiredPickups.length > 0 && (
								<LateSection
									titleId="late-pickups"
									title="Retraits dépassés — matériel à libérer"
									rows={expiredPickups}
									dateField="pickupDate"
									actionLabel={(row) =>
										`Annuler la réservation de ${row.clientName} et libérer le matériel`
									}
									actionIcon={<X className="size-4" />}
									onAction={(id) => cancelMutation.mutate(id)}
									isActionPending={cancelMutation.isPending}
								/>
							)}
						</div>
					)}
					<div className="grid grid-cols-3 gap-2 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:gap-4 dark:*:data-[slot=card]:bg-card">
						<KpiCard
							compact
							label="Aujourd’hui"
							value={kpis?.todayCount ?? "—"}
						/>
						<KpiCard
							compact
							label="En cours"
							value={kpis?.activeCount ?? "—"}
						/>
						<KpiCard
							compact
							label="À récupérer"
							value={kpis?.pendingPickup ?? "—"}
						/>
					</div>

					<div className="grid min-w-0 grid-cols-1 gap-4 @5xl:grid-cols-2">
						<ScheduleSection
							id="today-pickups"
							title="À récupérer aujourd'hui"
							rows={schedule?.pickups ?? []}
							isLoading={!schedule}
							emptyLabel="Aucune réservation à récupérer aujourd'hui"
							actionLabel={(row) =>
								`Marquer la réservation de ${row.clientName} comme récupérée`
							}
							actionIcon={<Check className="size-4" />}
							onAction={(id) => pickupMutation.mutate(id)}
							isActionPending={pickupMutation.isPending}
						/>

						<ScheduleSection
							id="today-returns"
							title="À rendre aujourd'hui"
							rows={schedule?.returns ?? []}
							isLoading={!schedule}
							emptyLabel="Aucune réservation à rendre aujourd'hui"
							actionLabel={(row) =>
								`Marquer la réservation de ${row.clientName} comme retournée`
							}
							actionIcon={<Undo2 className="size-4" />}
							onAction={(id) => returnMutation.mutate(id)}
							isActionPending={returnMutation.isPending}
						/>
					</div>
				</div>
			</div>
		</>
	);
}
