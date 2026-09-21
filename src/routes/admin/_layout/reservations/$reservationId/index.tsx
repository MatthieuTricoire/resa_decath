import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { BarcodeDisplay } from "#/components/barcode";
import { QRCodeDisplay } from "#/components/qr-code";
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
	getReservation,
	updateReservationStatus,
} from "#/features/reservations/queries";
import { queryKeys } from "#/features/reservations/query-keys";

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

const formatDt = (iso: string) => {
	const d = new Date(iso);
	return format(d, "dd/MM/yyyy à HH:mm", { locale: frLocale });
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

const statusActions: Record<
	string,
	Array<{ status: string; label: string; variant?: "default" | "destructive" }>
> = {
	PENDING_VERIFICATION: [
		{ status: "CONFIRMED", label: "Confirmer" },
		{ status: "CANCELLED", label: "Annuler", variant: "destructive" },
	],
	CONFIRMED: [
		{ status: "COLLECTED", label: "Marquer comme retiré" },
		{ status: "CANCELLED", label: "Annuler", variant: "destructive" },
	],
	COLLECTED: [{ status: "RETURNED", label: "Marquer comme retourné" }],
	RETURNED: [],
	CANCELLED: [],
	EXPIRED: [],
};

function RouteComponent() {
	const { reservationId } = Route.useParams();
	const queryClient = useQueryClient();

	const { data: reservation, isPending } = useQuery({
		queryKey: queryKeys.reservations.detail(reservationId),
		queryFn: () => getReservation({ data: reservationId }),
	});

	const statusMutation = useMutation({
		mutationFn: (newStatus: string) =>
			updateReservationStatus({
				data: {
					id: reservationId,
					status: newStatus as
						| "PENDING_VERIFICATION"
						| "CONFIRMED"
						| "COLLECTED"
						| "RETURNED"
						| "CANCELLED"
						| "EXPIRED",
				},
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.reservations.all,
			});
			toast.success("Statut mis à jour");
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
						<div>{formatDt(reservation.pickupDate)}</div>
						<div className="text-muted-foreground">Retour prévu</div>
						<div>{formatDt(reservation.returnDate)}</div>
						<div className="text-muted-foreground">Créée le</div>
						<div>{formatDt(reservation.createdAt)}</div>
						<div className="text-muted-foreground">Total</div>
						<div className="font-semibold">
							{formatPrice(reservation.totalPrice)}
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
									onClick={() => statusMutation.mutate(action.status)}
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
						<TableHeader className="bg-muted">
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
										{formatPrice(item.unitPrice)}
									</TableCell>
									<TableCell>
										<QRCodeDisplay value={item.priceOptionBarcode} size={36} />
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
