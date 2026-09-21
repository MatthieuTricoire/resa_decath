import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format, isSameDay, startOfDay } from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import { Eye, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
	getReservations,
	type ReservationRow,
} from "#/features/reservations/queries";
import { queryKeys } from "#/features/reservations/query-keys";

const activeStatuses = new Set([
	"PENDING_VERIFICATION",
	"CONFIRMED",
	"COLLECTED",
]);

function isTodayFilter(r: ReservationRow) {
	const pickup = new Date(r.pickupDate);
	const ret = new Date(r.returnDate);
	const now = new Date();
	if (isSameDay(pickup, now)) return true;
	if (isSameDay(ret, now)) return true;
	if (startOfDay(ret) < startOfDay(now) && activeStatuses.has(r.status))
		return true;
	return false;
}

function isActiveFilter(r: ReservationRow) {
	return activeStatuses.has(r.status);
}

function isLateReturn(r: ReservationRow) {
	return (
		r.status === "COLLECTED" &&
		startOfDay(new Date(r.returnDate)) < startOfDay(new Date())
	);
}

function isExpiredPickup(r: ReservationRow) {
	return (
		r.status === "PENDING_VERIFICATION" &&
		startOfDay(new Date(r.pickupDate)) < startOfDay(new Date())
	);
}

function isOverdue(r: ReservationRow) {
	return isLateReturn(r) || isExpiredPickup(r);
}

function overdueDays(r: ReservationRow) {
	const ref = isLateReturn(r) ? new Date(r.returnDate) : new Date(r.pickupDate);
	const diff = startOfDay(new Date()).getTime() - startOfDay(ref).getTime();
	return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function overdueLabel(r: ReservationRow) {
	const kind = isLateReturn(r) ? "Retour" : "Retrait";
	const days = overdueDays(r);
	return `${kind} en retard${days > 1 ? ` · ${days} j` : ""}`;
}

const statusBadgeClass: Record<string, string> = {
	PENDING_VERIFICATION:
		"bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
	CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
	COLLECTED:
		"bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
	RETURNED:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	EXPIRED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
};

const statusLabel: Record<string, string> = {
	PENDING_VERIFICATION: "À vérifier",
	CONFIRMED: "Confirmée",
	COLLECTED: "En cours",
	RETURNED: "Retournée",
	CANCELLED: "Annulée",
	EXPIRED: "Expirée",
};

const formatPrice = (val: string | null) => {
	if (!val) return "—";
	return `${parseFloat(val).toFixed(2).replace(".", ",")} €`;
};

const formatDate = (iso: string) => {
	const d = new Date(iso);
	return format(d, "dd/MM/yy HH:mm", { locale: frLocale });
};

export const Route = createFileRoute("/admin/_layout/reservations/")({
	loader: async ({ context: { queryClient } }) => {
		await queryClient.prefetchQuery({
			queryKey: queryKeys.reservations.list({ period: "all" }),
			queryFn: () => getReservations({ data: { period: "all" } }),
		});
	},
	component: RouteComponent,
});

function RouteComponent() {
	const [search, setSearch] = useState("");
	const [period, setPeriod] = useState<string>("today");

	const { data: reservations, isPending } = useQuery({
		queryKey: queryKeys.reservations.list({ period: "all", search }),
		queryFn: () =>
			getReservations({
				data: {
					period: "all",
					search: search || undefined,
				},
			}),
	});

	const filteredBySearch = useMemo(() => {
		if (!search) return reservations ?? [];
		const q = search.toLowerCase();
		return (reservations ?? []).filter(
			(v) =>
				v.clientName.toLowerCase().includes(q) ||
				v.clientEmail.toLowerCase().includes(q) ||
				(v.clientPhone ?? "").toLowerCase().includes(q),
		);
	}, [reservations, search]);

	const displayData = useMemo(() => {
		if (period === "today") return filteredBySearch.filter(isTodayFilter);
		if (period === "active") return filteredBySearch.filter(isActiveFilter);
		return filteredBySearch;
	}, [filteredBySearch, period]);

	const todayCount = useMemo(
		() => filteredBySearch.filter(isTodayFilter).length,
		[filteredBySearch],
	);

	const activeCount = useMemo(
		() => filteredBySearch.filter(isActiveFilter).length,
		[filteredBySearch],
	);

	const allCount = filteredBySearch.length;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-4">
				<div className="relative flex-1">
					<Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Rechercher par nom, email ou téléphone..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-8"
					/>
				</div>
			</div>

			<Tabs value={period} onValueChange={setPeriod}>
				<TabsList variant="line">
					<TabsTrigger value="today">
						Aujourd'hui <Badge variant="secondary">{todayCount}</Badge>
					</TabsTrigger>
					<TabsTrigger value="active">
						Actives <Badge variant="secondary">{activeCount}</Badge>
					</TabsTrigger>
					<TabsTrigger value="all">
						Toutes <Badge variant="secondary">{allCount}</Badge>
					</TabsTrigger>
				</TabsList>

				<TabsContent value={period}>
					<div className="overflow-hidden rounded-lg border">
						<Table>
							<TableHeader className="bg-muted">
								<TableRow>
									<TableHead>Client</TableHead>
									<TableHead>Téléphone</TableHead>
									<TableHead>Carte fidélité</TableHead>
									<TableHead>Retrait</TableHead>
									<TableHead>Retour</TableHead>
									<TableHead>Statut</TableHead>
									<TableHead>Total</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{isPending ? (
									<TableRow>
										<TableCell
											colSpan={8}
											className="h-24 text-center text-muted-foreground"
										>
											Chargement...
										</TableCell>
									</TableRow>
								) : displayData.length > 0 ? (
									displayData.map((r: ReservationRow) => (
										<TableRow
											key={r.id}
											className={
												isOverdue(r)
													? "bg-red-50/60 dark:bg-red-950/20"
													: undefined
											}
										>
											<TableCell>
												<div className="text-sm font-medium">
													{r.clientName}
												</div>
												<div className="text-xs text-muted-foreground">
													{r.clientEmail}
												</div>
											</TableCell>
											<TableCell className="text-sm">
												{r.clientPhone ?? "—"}
											</TableCell>
											<TableCell className="font-mono text-xs">
												{r.clientLoyaltyCard ?? "—"}
											</TableCell>
											<TableCell className="text-sm whitespace-nowrap">
												{formatDate(r.pickupDate)}
											</TableCell>
											<TableCell className="text-sm whitespace-nowrap">
												{formatDate(r.returnDate)}
											</TableCell>
											<TableCell>
												<div className="flex flex-col items-start gap-1">
													<Badge className={statusBadgeClass[r.status] ?? ""}>
														{statusLabel[r.status] ?? r.status}
													</Badge>
													{isOverdue(r) && (
														<Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
															{overdueLabel(r)}
														</Badge>
													)}
												</div>
											</TableCell>
											<TableCell className="text-sm font-medium">
												{formatPrice(r.totalPrice)}
											</TableCell>
											<TableCell>
												<Button
													variant="ghost"
													size="icon"
													className="size-8"
													asChild
												>
													<Link
														to="/admin/reservations/$reservationId"
														params={{
															reservationId: r.id,
														}}
													>
														<Eye className="size-4" />
													</Link>
												</Button>
											</TableCell>
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell
											colSpan={8}
											className="h-24 text-center text-muted-foreground"
										>
											Aucune réservation trouvée.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
