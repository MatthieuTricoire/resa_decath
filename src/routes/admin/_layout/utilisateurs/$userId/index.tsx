import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
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
import { getUserDetail, getUserReservations } from "#/features/users/queries";
import { queryKeys } from "#/features/users/query-keys";

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

const formatDt = (iso: string) => {
	const d = new Date(iso);
	return format(d, "dd/MM/yyyy à HH:mm", { locale: frLocale });
};

const formatPrice = (val: string | null) => {
	if (!val) return "—";
	return `${parseFloat(val).toFixed(2).replace(".", ",")} €`;
};

export const Route = createFileRoute("/admin/_layout/utilisateurs/$userId/")({
	loader: async ({ context: { queryClient }, params: { userId } }) => {
		await Promise.all([
			queryClient.prefetchQuery({
				queryKey: queryKeys.users.detail(userId),
				queryFn: () => getUserDetail({ data: userId }),
			}),
			queryClient.prefetchQuery({
				queryKey: queryKeys.users.reservations(userId),
				queryFn: () => getUserReservations({ data: userId }),
			}),
		]);
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { userId } = Route.useParams();

	const { data: user, isPending: userPending } = useQuery({
		queryKey: queryKeys.users.detail(userId),
		queryFn: () => getUserDetail({ data: userId }),
	});

	const { data: reservations, isPending: reservationsPending } = useQuery({
		queryKey: queryKeys.users.reservations(userId),
		queryFn: () => getUserReservations({ data: userId }),
	});

	if (userPending) {
		return <div className="text-sm text-muted-foreground">Chargement...</div>;
	}

	if (!user) {
		return (
			<div className="text-sm text-muted-foreground">
				Utilisateur introuvable.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" className="size-8" asChild>
					<Link to="/admin/utilisateurs">
						<ArrowLeft className="size-4" />
					</Link>
				</Button>
				<h2 className="text-lg font-semibold">{user.name}</h2>
				<Button variant="outline" size="sm" className="ml-auto" asChild>
					<Link to="/admin/utilisateurs/$userId/modifier" params={{ userId }}>
						<Pencil className="size-4" />
						Modifier
					</Link>
				</Button>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Informations</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
					<div className="text-muted-foreground">Nom</div>
					<div>{user.name}</div>
					<div className="text-muted-foreground">Email</div>
					<div>{user.email}</div>
					<div className="text-muted-foreground">Téléphone</div>
					<div>{user.phone ?? "—"}</div>
					<div className="text-muted-foreground">Carte Decathlon</div>
					<div className="font-mono">{user.loyaltyCard ?? "—"}</div>
					<div className="text-muted-foreground">Créé le</div>
					<div>{formatDt(user.createdAt)}</div>
					<div className="text-muted-foreground">Mis à jour le</div>
					<div>{formatDt(user.updatedAt)}</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Réservations ({reservations?.length ?? 0})</CardTitle>
				</CardHeader>
				<CardContent>
					{reservationsPending ? (
						<div className="text-sm text-muted-foreground">Chargement...</div>
					) : !reservations || reservations.length === 0 ? (
						<div className="text-sm text-muted-foreground">
							Aucune réservation trouvée.
						</div>
					) : (
						<div className="flex flex-col gap-4">
							{reservations.map((res) => (
								<Card key={res.id} className="border border-border/50">
									<CardContent className="pt-6">
										<div className="flex items-center justify-between mb-3">
											<Badge className={statusBadgeClass[res.status] ?? ""}>
												{statusLabel[res.status] ?? res.status}
											</Badge>
											<Button
												variant="ghost"
												size="icon"
												className="size-7"
												asChild
											>
												<Link
													to="/admin/reservations/$reservationId"
													params={{ reservationId: res.id }}
												>
													<ExternalLink className="size-3.5" />
												</Link>
											</Button>
										</div>
										<div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-3">
											<div className="text-muted-foreground">Retrait</div>
											<div>{formatDt(res.pickupDate)}</div>
											<div className="text-muted-foreground">Retour</div>
											<div>{formatDt(res.returnDate)}</div>
											<div className="text-muted-foreground">Total</div>
											<div className="font-semibold">
												{formatPrice(res.totalPrice)}
											</div>
										</div>
										{res.items.length > 0 && (
											<Table>
												<TableHeader className="bg-muted/50">
													<TableRow>
														<TableHead>Article</TableHead>
														<TableHead>Quantité</TableHead>
														<TableHead>Prix unitaire</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{res.items.map((item) => (
														<TableRow key={item.id}>
															<TableCell>
																<div className="text-sm font-medium">
																	{item.itemName}
																</div>
																<div className="text-xs text-muted-foreground">
																	{item.brand}
																</div>
															</TableCell>
															<TableCell>{item.quantity}</TableCell>
															<TableCell>
																{formatPrice(item.unitPrice)}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										)}
									</CardContent>
								</Card>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
