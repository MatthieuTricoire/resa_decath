import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import { ArrowLeft, CircleOff, Edit, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { BarcodeDisplay } from "#/components/barcode";
import { ConfirmDeleteDialog } from "#/components/dialogs/ConfirmDeleteDialog";
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
	getItem,
	getItemVariants,
	reactivateItem,
	retireItem,
	type VariantRow,
} from "#/features/equipements/queries";
import { queryKeys } from "#/features/equipements/query-keys";
import { SEASON_LABELS } from "#/features/reservations/availability";
import { openDialog } from "#/stores/dialog.store";
import { formatPriceString } from "#/stores/public-cart.store";

const seasonLabel = SEASON_LABELS;

const statusBadgeClass: Record<string, string> = {
	AVAILABLE:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	MAINTENANCE:
		"bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
	RETIRED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
};

const statusLabel: Record<string, string> = {
	AVAILABLE: "Disponible",
	MAINTENANCE: "En maintenance",
	RETIRED: "Retiré",
};

export const Route = createFileRoute("/admin/_layout/equipements/$itemId/")({
	loader: async ({ context: { queryClient }, params: { itemId } }) => {
		await Promise.all([
			queryClient.prefetchQuery({
				queryKey: queryKeys.items.detail(itemId),
				queryFn: () => getItem({ data: itemId }),
			}),
			queryClient.prefetchQuery({
				queryKey: queryKeys.variants.byItem(itemId),
				queryFn: () => getItemVariants({ data: itemId }),
			}),
		]);
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { itemId } = Route.useParams();
	const queryClient = useQueryClient();

	const { data: item, isPending: itemPending } = useQuery({
		queryKey: queryKeys.items.detail(itemId),
		queryFn: () => getItem({ data: itemId }),
	});

	const { data: variants, isPending: variantsPending } = useQuery({
		queryKey: queryKeys.variants.byItem(itemId),
		queryFn: () => getItemVariants({ data: itemId }),
	});

	if (itemPending) {
		return <div className="text-sm text-muted-foreground">Chargement...</div>;
	}

	if (!item) {
		return (
			<div className="text-sm text-muted-foreground">Article introuvable.</div>
		);
	}

	// Retiré = toutes les variantes en RETIRED (le formulaire de modification ne
	// gère pas le statut : c'est cette action qui pilote la visibilité publique).
	const isRetired =
		variants != null &&
		variants.length > 0 &&
		variants.every((v) => v.status === "RETIRED");

	const invalidateItem = () => {
		queryClient.invalidateQueries({ queryKey: queryKeys.variants.all });
		queryClient.invalidateQueries({ queryKey: queryKeys.items.detail(itemId) });
		queryClient.invalidateQueries({
			queryKey: queryKeys.variants.byItem(itemId),
		});
	};

	const handleRetire = () =>
		openDialog("confirmDelete", {
			title: "Retirer du catalogue",
			description: `« ${item.name} » ne sera plus proposé à la location sur le site. L'historique des réservations et les statistiques sont conservés.`,
			confirmLabel: "Retirer",
			onConfirm: async () => {
				try {
					await retireItem({ data: itemId });
					invalidateItem();
					toast.success("Article retiré du catalogue.");
				} catch (err) {
					const message =
						err instanceof Error
							? err.message
							: typeof err === "object" && err !== null && "message" in err
								? String(err.message)
								: "Erreur inconnue";
					toast.error(`Erreur : ${message}`);
				}
			},
		});

	const handleReactivate = async () => {
		try {
			await reactivateItem({ data: itemId });
			invalidateItem();
			toast.success("Article remis en location.");
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: typeof err === "object" && err !== null && "message" in err
						? String(err.message)
						: "Erreur inconnue";
			toast.error(`Erreur : ${message}`);
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="icon" className="size-8" asChild>
						<Link to="/admin/equipements">
							<ArrowLeft className="size-4" />
						</Link>
					</Button>
					<h2 className="text-lg font-semibold">{item.name}</h2>
					<Badge variant="outline">{item.categoryName}</Badge>
				</div>
				<div className="flex items-center gap-2">
					{isRetired ? (
						<Button
							variant="outline"
							size="sm"
							onClick={handleReactivate}
							disabled={variantsPending}
						>
							<CircleOff className="size-4" />
							Remettre en location
						</Button>
					) : (
						<Button
							variant="destructive"
							size="sm"
							onClick={handleRetire}
							disabled={variantsPending}
						>
							<CircleOff className="size-4" />
							Retirer du catalogue
						</Button>
					)}
					<Button variant="outline" size="sm" asChild>
						<Link to="/admin/equipements/$itemId/modifier" params={{ itemId }}>
							<Edit />
							Modifier
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-3 gap-6">
				<div className="col-span-2 flex flex-col gap-6">
					<Card>
						<CardHeader>
							<CardTitle>Informations générales</CardTitle>
						</CardHeader>
						<CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
							<div className="text-muted-foreground">Marque</div>
							<div>{item.brand}</div>
							<div className="text-muted-foreground">Catégorie</div>
							<div>{item.categoryName}</div>
							<div className="text-muted-foreground">Saison</div>
							<div>
								<Badge variant="secondary">
									{seasonLabel[item.season] ?? item.season}
								</Badge>
							</div>
							{item.decathlonUrl && (
								<>
									<div className="text-muted-foreground">Lien Decathlon</div>
									<div>
										<a
											href={item.decathlonUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
										>
											Voir sur Decathlon.fr
										</a>
									</div>
								</>
							)}
							<div className="text-muted-foreground">Disponibilité</div>
							<div>
								{item.availableFrom && item.availableTo
									? `Du ${format(
											new Date(
												2000,
												Number(item.availableFrom.split("-")[0]) - 1,
												Number(item.availableFrom.split("-")[1]),
											),
											"d MMMM",
											{ locale: frLocale },
										)} au ${format(
											new Date(
												2000,
												Number(item.availableTo.split("-")[0]) - 1,
												Number(item.availableTo.split("-")[1]),
											),
											"d MMMM",
											{ locale: frLocale },
										)}`
									: item.availableFrom
										? `À partir du ${format(
												new Date(
													2000,
													Number(item.availableFrom.split("-")[0]) - 1,
													Number(item.availableFrom.split("-")[1]),
												),
												"d MMMM",
												{ locale: frLocale },
											)}`
										: item.availableTo
											? `Jusqu'au ${format(
													new Date(
														2000,
														Number(item.availableTo.split("-")[0]) - 1,
														Number(item.availableTo.split("-")[1]),
													),
													"d MMMM",
													{ locale: frLocale },
												)}`
											: "Toute l'année"}
							</div>
							<div className="text-muted-foreground">Durée minimum</div>
							<div>
								{item.minDuration} journée{item.minDuration > 1 ? "s" : ""}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Description</CardTitle>
						</CardHeader>
						<CardContent>
							{item.description ? (
								<p className="text-sm text-muted-foreground whitespace-pre-wrap">
									{item.description}
								</p>
							) : (
								<p className="text-sm text-muted-foreground italic">
									Aucune description.
								</p>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Variantes</CardTitle>
						</CardHeader>
						<CardContent>
							{variantsPending ? (
								<div className="text-sm text-muted-foreground">
									Chargement...
								</div>
							) : variants && variants.length > 0 ? (
								<Table>
									<TableHeader className="bg-muted/50">
										<TableRow>
											<TableHead>Attributs</TableHead>
											<TableHead>SKU</TableHead>
											<TableHead>Statut</TableHead>
											<TableHead>Stock</TableHead>
											<TableHead>Prix</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{variants.map((v: VariantRow) => (
											<TableRow key={v.id}>
												<TableCell>
													{v.attributes.length > 0 ? (
														<span className="text-xs text-muted-foreground">
															{v.attributes
																.map((a) => `${a.name}: ${a.value}`)
																.join(", ")}
														</span>
													) : (
														<span className="text-xs text-muted-foreground italic">
															—
														</span>
													)}
												</TableCell>
												<TableCell className="font-mono text-xs">
													{v.decathlonSku ?? "—"}
												</TableCell>
												<TableCell>
													<Badge className={statusBadgeClass[v.status] ?? ""}>
														{statusLabel[v.status] ?? v.status}
													</Badge>
												</TableCell>
												<TableCell>{v.totalStock}</TableCell>
												<TableCell>
													{v.priceOptions.length > 0 ? (
														<div className="flex flex-col gap-2">
															{v.priceOptions.map((opt) => (
																<div
																	key={opt.id}
																	className="flex items-center gap-1.5"
																>
																	<div className="text-xs leading-tight min-w-0 w-16 shrink-0">
																		<div className="font-medium truncate">
																			{opt.label}
																		</div>
																		<div className="text-muted-foreground whitespace-nowrap">
																			{formatPriceString(opt.price)}
																		</div>
																	</div>
																	<BarcodeDisplay
																		value={opt.barcode}
																		height={22}
																		barWidth={0.8}
																	/>
																</div>
															))}
														</div>
													) : (
														<span className="text-muted-foreground">—</span>
													)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							) : (
								<p className="text-sm text-muted-foreground italic">
									Aucune variante.
								</p>
							)}
						</CardContent>
					</Card>
				</div>

				<div className="col-span-1">
					<Card>
						<CardHeader>
							<CardTitle>Images</CardTitle>
						</CardHeader>
						<CardContent>
							{item.images && item.images.length > 0 ? (
								<div className="grid grid-cols-2 gap-2">
									{item.images.map((img) => (
										<img
											key={img.id}
											src={img.url}
											alt={img.alt ?? item.name}
											className="w-full aspect-square rounded-lg object-cover"
										/>
									))}
								</div>
							) : (
								<div className="flex aspect-square items-center justify-center rounded-lg border border-dashed bg-muted">
									<div className="flex flex-col items-center gap-2 text-muted-foreground">
										<ImageIcon className="size-8" />
										<span className="text-xs">Aucune image</span>
									</div>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
			<ConfirmDeleteDialog />
		</div>
	);
}
