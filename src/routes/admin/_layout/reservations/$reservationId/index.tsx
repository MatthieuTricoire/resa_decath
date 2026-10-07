import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { BarcodeDisplay } from "#/components/barcode";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import {
	isLatePickup,
	isLateReturn,
	isOverdue,
	overdueLabel,
} from "#/features/reservations/late-status";
import {
	getReservation,
	updateReservationStatus,
} from "#/features/reservations/queries";
import { queryKeys } from "#/features/reservations/query-keys";
import { todayInParis, toParisDateKey } from "#/lib/dates";
import { openDialog, type ReservationActionData } from "#/stores/dialog.store";
import { formatPriceString } from "#/stores/public-cart.store";

const statusBadgeClass: Record<string, string> = {
	CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
	COLLECTED:
		"bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
	RETURNED:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const statusLabel: Record<string, string> = {
	CONFIRMED: "Confirmée",
	COLLECTED: "En cours",
	RETURNED: "Retournée",
	CANCELLED: "Annulée",
};

/** Un vrai horodatage : l'heure de création de la réservation est une donnée. */
const formatDt = (iso: string) => {
	const d = new Date(iso);
	return format(d, "dd/MM/yyyy à HH:mm", { locale: frLocale });
};

/**
 * Une date de retrait ou de retour, sans heure.
 *
 * Le retrait et le retour n'ont pas d'heure : le site ne propose que des dates,
 * converties à midi UTC par convention. L'heure stockée est donc une constante —
 * 14:00 en été, 13:00 en hiver — et l'afficher ne dirait rien du tout.
 */
const formatDateOnly = (iso: string) => {
	const d = new Date(iso);
	return format(d, "dd/MM/yyyy", { locale: frLocale });
};

export const Route = createFileRoute(
	"/admin/_layout/reservations/$reservationId/",
)({
	loader: async ({ context: { queryClient }, params: { reservationId } }) => {
		await queryClient.prefetchQuery({
			queryKey: queryKeys.reservations.detail(reservationId),
			queryFn: () => getReservation({ data: reservationId }),
		});
	},
	component: RouteComponent,
});

type StatusValue = "CONFIRMED" | "COLLECTED" | "RETURNED" | "CANCELLED";

/**
 * Le statut visé par une action, et le type de dialogue qu'elle ouvre.
 *
 * Les libellés restent ici, sur la fiche : c'est le seul écran qui parle en
 * « marquer comme retiré », le tableau du jour ayant ses propres tournures.
 */
const statusActions: Record<
	string,
	Array<{
		status: StatusValue;
		label: string;
		kind: ReservationActionData["kind"];
		variant?: "default" | "destructive";
	}>
> = {
	// « Confirmer » n'existe pas : une réservation est confirmée dès sa
	// création. La seule issue d'un retrait non effectué est l'annulation.
	CONFIRMED: [
		{ status: "COLLECTED", label: "Marquer comme retiré", kind: "pickup" },
		{
			status: "CANCELLED",
			label: "Annuler",
			kind: "cancel",
			variant: "destructive",
		},
	],
	COLLECTED: [
		{ status: "RETURNED", label: "Marquer comme retourné", kind: "return" },
	],
	RETURNED: [],
	CANCELLED: [],
};

/** Le retrait prévu est-il déjà passé ? Clés de Paris, comme partout ailleurs. */
const isPickupLate = (iso: string) =>
	toParisDateKey(new Date(iso)) < todayInParis();

function RouteComponent() {
	const { reservationId } = Route.useParams();
	const queryClient = useQueryClient();

	const { data: reservation, isPending } = useQuery({
		queryKey: queryKeys.reservations.detail(reservationId),
		queryFn: () => getReservation({ data: reservationId }),
	});

	const statusMutation = useMutation({
		mutationFn: ({
			status,
			noShow,
		}: {
			status: StatusValue;
			noShow?: boolean;
		}) =>
			updateReservationStatus({
				data: { id: reservationId, status, noShow },
			}),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.reservations.all,
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.reservations.detail(reservationId),
			});
			toast.success(
				variables.status === "CANCELLED"
					? variables.noShow
						? "Réservation annulée, client marqué non présenté"
						: "Réservation annulée, matériel libéré"
					: "Statut mis à jour",
			);
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Erreur lors de la mise à jour",
			);
		},
	});

	if (isPending) {
		return <div className="text-sm text-muted-foreground">Chargement...</div>;
	}

	if (!reservation) {
		return (
			<div className="text-sm text-muted-foreground">
				Réservation introuvable.
			</div>
		);
	}

	const actions = statusActions[reservation.status] ?? [];

	/**
	 * Rien ne s'exécute au clic : le bouton énonce l'action, la dialogue la
	 * confirme. Même parcours que le tableau du jour du dashboard, pour que le
	 * comptoir ne découvre jamais une annulation déjà produite.
	 */
	const openAction = (action: (typeof statusActions)[string][number]) => {
		openDialog("reservationAction", {
			kind: action.kind,
			clientName: reservation.clientName,
			defaultNoShow: isPickupLate(reservation.pickupDate),
			onConfirm: async (noShow) => {
				await statusMutation.mutateAsync({
					status: action.status,
					noShow: action.kind === "cancel" ? noShow : undefined,
				});
			},
		});
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" className="size-8" asChild>
					<Link to="/admin/reservations">
						<ArrowLeft className="size-4" />
					</Link>
				</Button>
				<h2 className="text-lg font-semibold">Réservation</h2>
				<Badge className={statusBadgeClass[reservation.status] ?? ""}>
					{statusLabel[reservation.status] ?? reservation.status}
				</Badge>
				{isOverdue(reservation) && (
					<Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
						{overdueLabel(reservation)}
					</Badge>
				)}
				{reservation.isNoShow === 1 && (
					<Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
						Non présenté
					</Badge>
				)}
			</div>

			<div className="grid grid-cols-2 gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Client</CardTitle>
					</CardHeader>
					<CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
						<div className="text-muted-foreground">Nom</div>
						<div>{reservation.clientName}</div>
						<div className="text-muted-foreground">Email</div>
						<div>{reservation.clientEmail}</div>
						<div className="text-muted-foreground">Téléphone</div>
						<div>{reservation.clientPhone ?? "—"}</div>
						<div className="text-muted-foreground">Carte fidélité</div>
						<div className="font-mono">
							{reservation.clientLoyaltyCard ?? "—"}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Période</CardTitle>
					</CardHeader>
					<CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
						<div className="text-muted-foreground">Retrait prévu</div>
						<div
							className={
								isLatePickup(reservation)
									? "font-semibold text-red-600 dark:text-red-400"
									: undefined
							}
						>
							{formatDateOnly(reservation.pickupDate)}
						</div>
						<div className="text-muted-foreground">Retour prévu</div>
						<div
							className={
								isLateReturn(reservation)
									? "font-semibold text-red-600 dark:text-red-400"
									: undefined
							}
						>
							{formatDateOnly(reservation.returnDate)}
						</div>
						<div className="text-muted-foreground">Créée le</div>
						<div>{formatDt(reservation.createdAt)}</div>
						<div className="text-muted-foreground">Total</div>
						<div className="font-semibold">
							{formatPriceString(reservation.totalPrice)}
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle>Articles réservés</CardTitle>
					{actions.length > 0 && (
						<div className="flex items-center gap-2">
							{actions.map((action) => (
								<Button
									key={action.status}
									size="sm"
									variant={
										action.variant === "destructive" ? "destructive" : "default"
									}
									onClick={() => openAction(action)}
									disabled={statusMutation.isPending}
								>
									{action.label}
								</Button>
							))}
						</div>
					)}
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader className="bg-muted/50">
							<TableRow>
								<TableHead>Article</TableHead>
								<TableHead>SKU</TableHead>
								<TableHead>Option</TableHead>
								<TableHead>Qté</TableHead>
								<TableHead>Prix unitaire</TableHead>
								<TableHead>QR Code</TableHead>
								<TableHead>Code-barres</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{reservation.items.map((item) => (
								<TableRow key={item.id}>
									<TableCell>
										<div className="text-sm font-medium">{item.itemName}</div>
										<div className="text-xs text-muted-foreground">
											{item.brand}
										</div>
									</TableCell>
									<TableCell className="font-mono text-xs">
										{item.variantSku ?? "—"}
									</TableCell>
									<TableCell className="text-sm">
										{item.priceOptionLabel}
									</TableCell>
									<TableCell>{item.quantity}</TableCell>
									<TableCell className="text-sm font-medium">
										{formatPriceString(item.unitPrice)}
									</TableCell>
									<TableCell>
										<BarcodeDisplay
											value={item.priceOptionBarcode}
											height={20}
											barWidth={0.6}
										/>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
