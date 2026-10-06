import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	type RentalWindowChange,
	RentalWindowField,
} from "#/components/forms/rental-window-field";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "#/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { getRentalDurations } from "#/features/durees/queries";
import { queryKeys as dureeQueryKeys } from "#/features/durees/query-keys";
import {
	getReservableVariants,
	type VariantRow,
} from "#/features/equipements/queries";
import { queryKeys as equipmentQueryKeys } from "#/features/equipements/query-keys";
import { getReservationDurationDays } from "#/features/reservations/availability";
import {
	blockedCheckoutDurations,
	resolveCheckoutWindow,
} from "#/features/reservations/checkout-window";
import { validateClient } from "#/features/reservations/client-validation";
import {
	type CreateReservationInput,
	createReservation,
	getAvailableStock,
} from "#/features/reservations/queries";
import { queryKeys as reservationQueryKeys } from "#/features/reservations/query-keys";
import { getStoreHours } from "#/features/store-hours/queries";
import { storeHoursKeys } from "#/features/store-hours/query-keys";
import { openDaysFromHours } from "#/features/store-hours/types";
import {
	type CreateUserInput,
	createUser,
	getUsers,
} from "#/features/users/queries";
import { queryKeys } from "#/features/users/query-keys";
import { formatPriceString } from "#/stores/public-cart.store";

export const Route = createFileRoute("/admin/_layout/reservations/ajouter")({
	component: RouteComponent,
});

function getVariantLabel(variant: VariantRow, variantCount: number): string {
	const attributes = variant.attributes
		.map((attribute) => `${attribute.name}: ${attribute.value}`)
		.join(", ");
	if (attributes) return attributes;
	if (variantCount <= 1) return "Variante unique";
	return variant.decathlonSku ? `SKU ${variant.decathlonSku}` : "Par défaut";
}

function RouteComponent() {
	const router = useRouter();
	const queryClient = useQueryClient();

	const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
	const [selectedUserId, setSelectedUserId] = useState("");
	const [newName, setNewName] = useState("");
	const [newEmail, setNewEmail] = useState("");
	const [newPhone, setNewPhone] = useState("");
	const [newLoyaltyCard, setNewLoyaltyCard] = useState("");

	const [searchClient, setSearchClient] = useState("");

	const [pickupDate, setPickupDate] = useState("");
	const [returnDate, setReturnDate] = useState("");

	const [selectedVariantId, setSelectedVariantId] = useState("");
	const [selectedPriceOptionId, setSelectedPriceOptionId] = useState("");
	const [quantity, setQuantity] = useState(1);

	const [lineItems, setLineItems] = useState<
		Array<{
			key: string;
			variantId: string;
			priceOptionId: string | null;
			quantity: number;
			itemName: string;
			variantLabel: string;
			priceOptionLabel: string;
			unitPrice: string;
		}>
	>([]);

	const { data: users } = useQuery({
		queryKey: queryKeys.users.all,
		queryFn: () => getUsers({ data: {} }),
	});

	const clientValidation = useMemo(
		() =>
			clientMode === "existing"
				? validateClient({
						mode: "existing",
						selectedUserId,
						knownUserIds: (users ?? []).map((user) => user.id),
					})
				: validateClient({
						mode: "new",
						name: newName,
						email: newEmail,
						phone: newPhone,
					}),
		[clientMode, selectedUserId, users, newName, newEmail, newPhone],
	);
	const clientErrorMessage =
		clientValidation.errors.user ??
		clientValidation.errors.name ??
		clientValidation.errors.email ??
		clientValidation.errors.phone;
	const clientHint =
		clientMode === "existing"
			? "Sélectionnez un client pour créer la réservation."
			: "Renseignez le nom, l'email et le téléphone du nouveau client.";
	const emailError =
		newEmail.trim() && clientValidation.errors.email
			? clientValidation.errors.email
			: undefined;

	const reservableDates = useMemo(() => {
		if (!pickupDate || !returnDate) return null;
		const pickup = new Date(`${pickupDate}T12:00:00.000Z`);
		const returned = new Date(`${returnDate}T12:00:00.001Z`);
		if (returned <= pickup) return null;
		return {
			pickupDate: pickup.toISOString(),
			returnDate: returned.toISOString(),
		};
	}, [pickupDate, returnDate]);

	const { data: reservableData, isFetching: variantsPending } = useQuery({
		queryKey: equipmentQueryKeys.variants.reservable(
			reservableDates?.pickupDate ?? "",
			reservableDates?.returnDate ?? "",
		),
		queryFn: () =>
			getReservableVariants({
				data: {
					pickupDate: reservableDates?.pickupDate ?? "",
					returnDate: reservableDates?.returnDate ?? "",
				},
			}),
		enabled: reservableDates !== null,
	});
	const allVariants = reservableData?.variants;

	const selectedVariant = useMemo(
		() => allVariants?.find((v) => v.id === selectedVariantId),
		[allVariants, selectedVariantId],
	);

	const selectedPriceOption = useMemo(() => {
		return (
			selectedVariant?.priceOptions.find(
				(o) => o.id === selectedPriceOptionId,
			) ?? null
		);
	}, [selectedVariant, selectedPriceOptionId]);

	const computedDuration = useMemo(() => {
		if (!pickupDate || !returnDate) return null;
		const pickup = new Date(`${pickupDate}T12:00:00.000Z`);
		const retour = new Date(`${returnDate}T12:00:00.000Z`);
		return getReservationDurationDays(pickup, retour);
	}, [pickupDate, returnDate]);

	// Mêmes règles que le site public : les jours d'ouverture viennent de
	// `store_hours`, les durées affichées de la table de référence des durées.
	// Tant que les horaires chargent, aucune date n'est exclue — plutôt que d'en
	// exclure de mauvaises sur la base d'une information pas encore arrivée.
	const { data: storeHours } = useQuery({
		queryKey: storeHoursKeys.all,
		queryFn: () => getStoreHours(),
		staleTime: 5 * 60 * 1000,
	});
	const { data: rentalDurations, isPending: durationsPending } = useQuery({
		queryKey: dureeQueryKeys.durees.all,
		queryFn: () => getRentalDurations(),
		staleTime: 5 * 60 * 1000,
	});
	// Mémoïsé pour rester une référence stable : sans cela le mémo des durées
	// bloquées se recalculerait à chaque rendu.
	const openingDays = useMemo(
		() =>
			storeHours ? { openDays: openDaysFromHours(storeHours) } : undefined,
		[storeHours],
	);
	const durationOptions = useMemo(
		() => (rentalDurations ?? []).map((row) => row.days),
		[rentalDurations],
	);

	/**
	 * Durées que la caisse refuse d'appliquer, et pourquoi : le magasin fermé le
	 * jour du retour, ou un matériel qui ne vend pas cette durée. La règle vit dans
	 * `checkout-window`, testée ; la page ne fait que lui passer ce qu'elle a lu.
	 */
	const blockedDurations = useMemo(
		() =>
			blockedCheckoutDurations({
				pickupDate,
				durations: durationOptions,
				settings: openingDays,
				priceOptions: selectedVariant?.priceOptions,
				minDuration: selectedVariant?.minDuration,
			}),
		[pickupDate, durationOptions, openingDays, selectedVariant],
	);

	/**
	 * Pose la fenêtre et invalide la commande.
	 *
	 * Changer une date ou une durée change la période occupée : les articles
	 * choisis, leur variant et leur tarif ne sont plus valables et repartent de zéro.
	 * Une durée qui ne convient plus est remplacée par la plus proche servie, comme
	 * sur le site ; si aucune ne convient, la fenêtre reste vide plutôt que de
	 * proposer un retour impossible.
	 */
	const applyWindow = (change: RentalWindowChange) => {
		// Le champ refuse une durée tant qu'aucune date de départ n'est choisie,
		// donc ce cas n'est plus atteignable. On ne part pas d'aujourd'hui non plus :
		// un jour de fermeture produirait une date affichée sans fenêtre derrière,
		// et le texte « Choisissez une date de départ » contredirait le champ date.
		if (!change.pickupDate) return;
		const nextPickup = change.pickupDate;
		const window = resolveCheckoutWindow({
			pickupDate: nextPickup,
			requestedDuration: change.durationDays,
			durations: durationOptions,
			settings: openingDays,
		});
		setPickupDate(nextPickup);
		setReturnDate(window?.returnDate ?? "");
		setLineItems([]);
		setSelectedItemId("");
		setSelectedVariantId("");
		setSelectedPriceOptionId("");
	};

	// La durée de la fenêtre choisit l'option : l'admin ne peut pas facturer
	// une durée que le catalogue ne couvre pas.
	useEffect(() => {
		if (!selectedVariant || !computedDuration) {
			setSelectedPriceOptionId("");
			return;
		}
		const match = selectedVariant.priceOptions.find(
			(o) => o.duration === computedDuration,
		);
		setSelectedPriceOptionId(match?.id ?? "");
	}, [selectedVariant, computedDuration]);

	const filteredPriceOptions = useMemo(() => {
		if (!selectedVariant) return [];
		if (!computedDuration) return selectedVariant.priceOptions;
		return selectedVariant.priceOptions.filter(
			(o) => o.duration === computedDuration,
		);
	}, [selectedVariant, computedDuration]);

	const hasDates = reservableDates !== null;

	const stockQuery = useQuery({
		queryKey: ["stock", selectedVariantId, pickupDate, returnDate],
		queryFn: () =>
			getAvailableStock({
				data: {
					variantId: selectedVariantId,
					pickupDate: new Date(`${pickupDate}T12:00:00.000Z`).toISOString(),
					returnDate: new Date(`${returnDate}T12:00:00.001Z`).toISOString(),
				},
			}),
		enabled: !!selectedVariantId && !!hasDates,
	});

	const qtyAlreadyInCart = useMemo(
		() =>
			lineItems
				.filter((item) => item.variantId === selectedVariantId)
				.reduce((sum, item) => sum + item.quantity, 0),
		[lineItems, selectedVariantId],
	);

	const effectiveAvailable = useMemo(
		() =>
			Math.max(0, (stockQuery.data?.availableQuantity ?? 0) - qtyAlreadyInCart),
		[stockQuery.data, qtyAlreadyInCart],
	);

	const displayAvailable = useMemo(
		() => Math.max(0, effectiveAvailable - quantity),
		[effectiveAvailable, quantity],
	);

	const uniqueItems = useMemo(() => {
		const map = new Map<string, { id: string; name: string; brand: string }>();
		for (const v of allVariants ?? []) {
			if (!map.has(v.itemId)) {
				map.set(v.itemId, {
					id: v.itemId,
					name: v.itemName,
					brand: v.brand,
				});
			}
		}
		return Array.from(map.values());
	}, [allVariants]);

	const [selectedItemId, setSelectedItemId] = useState("");

	const filteredVariants = useMemo(
		() => allVariants?.filter((v) => v.itemId === selectedItemId) ?? [],
		[allVariants, selectedItemId],
	);

	useEffect(() => {
		const nextItemId = uniqueItems.some((item) => item.id === selectedItemId)
			? selectedItemId
			: uniqueItems.length === 1
				? uniqueItems[0].id
				: "";
		if (nextItemId !== selectedItemId) setSelectedItemId(nextItemId);
	}, [selectedItemId, uniqueItems]);

	useEffect(() => {
		const nextVariantId = filteredVariants.some(
			(v) => v.id === selectedVariantId,
		)
			? selectedVariantId
			: filteredVariants.length === 1
				? filteredVariants[0].id
				: "";
		if (nextVariantId !== selectedVariantId)
			setSelectedVariantId(nextVariantId);
	}, [filteredVariants, selectedVariantId]);

	const addItem = () => {
		if (!selectedVariant) return;
		const variantLabel = getVariantLabel(
			selectedVariant,
			filteredVariants.length,
		);

		if (!selectedPriceOption) return;
		setLineItems((prev) => [
			...prev,
			{
				key: crypto.randomUUID(),
				variantId: selectedVariant.id,
				priceOptionId: selectedPriceOption.id,
				quantity,
				itemName: selectedVariant.itemName,
				variantLabel,
				priceOptionLabel: selectedPriceOption.label,
				unitPrice: selectedPriceOption.price,
			},
		]);
		setSelectedItemId("");
		setSelectedVariantId("");
		setSelectedPriceOptionId("");
		setQuantity(1);
	};

	const removeItem = (index: number) => {
		setLineItems((prev) => prev.filter((_, i) => i !== index));
	};

	const totalPrice = useMemo(
		() =>
			lineItems.reduce(
				(sum, item) => sum + Number.parseFloat(item.unitPrice) * item.quantity,
				0,
			),
		[lineItems],
	);

	const createUserMutation = useMutation({
		mutationFn: (input: CreateUserInput) => createUser({ data: input }),
	});

	const createReservationMutation = useMutation({
		mutationFn: (input: CreateReservationInput) =>
			createReservation({ data: input }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: reservationQueryKeys.reservations.all,
			});
			toast.success("Réservation créée avec succès");
			router.navigate({ to: "/admin/reservations" });
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Erreur lors de la création",
			);
		},
	});

	const isPending =
		createUserMutation.isPending || createReservationMutation.isPending;

	const handleSelect = (id: string | null) => {
		const newId = id ?? "";
		setSelectedUserId(newId);
		const user = users?.find((u) => u.id === newId);
		setSearchClient(user ? `${user.name} — ${user.email}` : "");
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!pickupDate || !returnDate) {
			toast.error("Veuillez remplir les dates de retrait et retour");
			return;
		}
		if (lineItems.length === 0) {
			toast.error("Ajoutez au moins un article à la réservation");
			return;
		}
		if (
			lineItems.some(
				(item) =>
					!allVariants?.some((variant) => variant.id === item.variantId),
			)
		) {
			toast.error("Un article n’est plus disponible pour ces dates");
			return;
		}

		const pickup = new Date(`${pickupDate}T12:00:00.000Z`);
		const returnD = new Date(`${returnDate}T12:00:00.001Z`);

		if (returnD <= pickup) {
			toast.error("La date de retour doit être après la date de retrait");
			return;
		}

		let userId = selectedUserId;

		if (!clientValidation.valid) {
			toast.error(
				clientErrorMessage ??
					"Renseignez les informations du client avant de continuer",
			);
			return;
		}

		if (clientMode === "new") {
			try {
				const created = await createUserMutation.mutateAsync({
					name: newName.trim(),
					email: newEmail.trim(),
					phone: newPhone.trim(),
					loyaltyCard: newLoyaltyCard.trim() || undefined,
				});
				userId = created.id;
			} catch (err) {
				toast.error(
					err instanceof Error
						? err.message
						: "Erreur lors de la création du client",
				);
				return;
			}
		}

		createReservationMutation.mutate({
			userId,
			pickupDate: pickup.toISOString(),
			returnDate: returnD.toISOString(),
			items: lineItems.map((item) => ({
				variantId: item.variantId,
				priceOptionId: item.priceOptionId ?? undefined,
				quantity: item.quantity,
			})),
		});
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-6">
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" className="size-8" asChild>
					<a href="/admin/reservations">
						<ArrowLeft className="size-4" />
					</a>
				</Button>
				<h2 className="text-lg font-semibold">Créer une réservation</h2>
			</div>

			{/* Le client et la période forment les deux premières étapes de la saisie :
			    sur un grand écran elles se lisent ensemble, ce qui remonte le tableau
			    des articles dans la fenêtre. 2/1 plutôt que 50/50 : le mode « nouveau
			    client » garde deux colonnes de champs confortables, les dates se
			    contentent d'un bouton et de quatre pastilles. En dessous de `xl`, les
			    deux cartes s'empilent comme avant. La grille les étire à la même
			    hauteur par défaut, sans classe supplémentaire. */}
			<div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<Card>
					<CardHeader>
						<CardTitle>Client *</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex gap-2">
							<Button
								type="button"
								variant={clientMode === "existing" ? "default" : "outline"}
								size="sm"
								onClick={() => setClientMode("existing")}
							>
								Client existant
							</Button>
							<Button
								type="button"
								variant={clientMode === "new" ? "default" : "outline"}
								size="sm"
								onClick={() => setClientMode("new")}
							>
								Nouveau client
							</Button>
						</div>

						{clientMode === "existing" ? (
							<Field>
								<FieldLabel>Sélectionner un client *</FieldLabel>
								<Combobox
									items={users ?? []}
									value={selectedUserId}
									onValueChange={handleSelect}
								>
									<ComboboxInput
										placeholder="Rechercher un client..."
										value={searchClient}
										onChange={(e) => setSearchClient(e.target.value)}
										aria-invalid={!clientValidation.valid}
									/>
									<ComboboxContent>
										<ComboboxEmpty>Aucun client trouvé</ComboboxEmpty>
										<ComboboxList>
											{(user) => (
												<ComboboxItem key={user.id} value={user.id}>
													{user.name} — {user.email}
												</ComboboxItem>
											)}
										</ComboboxList>
									</ComboboxContent>
								</Combobox>
							</Field>
						) : (
							<div className="grid grid-cols-2 gap-4">
								<Field>
									<FieldLabel htmlFor="new-client-name">Nom *</FieldLabel>
									<Input
										id="new-client-name"
										name="name"
										autoComplete="name"
										required
										value={newName}
										onChange={(e) => setNewName(e.target.value)}
										placeholder="Prénom et nom"
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="new-client-email">Email *</FieldLabel>
									<Input
										id="new-client-email"
										name="email"
										autoComplete="email"
										type="email"
										required
										aria-invalid={Boolean(emailError)}
										value={newEmail}
										onChange={(e) => setNewEmail(e.target.value)}
										placeholder="client@example.com"
									/>
									{emailError && (
										<FieldDescription>{emailError}</FieldDescription>
									)}
								</Field>
								<Field>
									<FieldLabel htmlFor="new-client-phone">
										Téléphone *
									</FieldLabel>
									<Input
										id="new-client-phone"
										name="phone"
										autoComplete="tel"
										type="tel"
										required
										value={newPhone}
										onChange={(e) => setNewPhone(e.target.value)}
										placeholder="06 12 34 56 78"
									/>
								</Field>
								<Field>
									<FieldLabel>Carte Decathlon</FieldLabel>
									<Input
										value={newLoyaltyCard}
										onChange={(e) => setNewLoyaltyCard(e.target.value)}
										placeholder="Optionnel"
									/>
								</Field>
							</div>
						)}

						{!clientValidation.valid && (
							<FieldDescription>{clientHint}</FieldDescription>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Dates</CardTitle>
					</CardHeader>
					<CardContent>
						{/* Même saisie que sur le site : une date de départ puis une durée. Le
						    retour s'en déduit, et il ne peut pas tomber un jour de fermeture.
						    Pas de titre visible ici : la carte porte déjà « Dates », la légende
						    ne sert alors plus que de nom accessible du groupe. */}
						<RentalWindowField
							pickupDate={pickupDate || null}
							returnDate={returnDate || null}
							durations={durationOptions}
							settings={openingDays}
							blockedDurations={blockedDurations}
							isPending={durationsPending}
							emptyMessage="Aucune durée n’est configurée. Ajoutez-en depuis les réglages du catalogue."
							onChange={applyWindow}
							onClear={() =>
								applyWindow({ pickupDate: null, durationDays: null })
							}
						/>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle>Articles</CardTitle>
					<Badge variant="secondary" className="text-sm">
						Total : {formatPriceString(String(totalPrice.toFixed(2)))}
					</Badge>
				</CardHeader>
				<CardContent className="space-y-4">
					{!reservableDates && (
						<p className="text-sm text-muted-foreground">
							Choisissez une date de départ puis une durée pour afficher les
							articles disponibles pendant toute la période.
						</p>
					)}
					{reservableDates && reservableData?.isRentalOpen === false && (
						<p className="text-sm text-destructive">
							Les locations sont actuellement fermées.
						</p>
					)}
					{reservableDates &&
						reservableData?.isRentalOpen !== false &&
						(variantsPending ? (
							<p className="text-sm text-muted-foreground">
								Filtrage des articles disponibles...
							</p>
						) : allVariants?.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Aucun article n’est disponible pour ces dates.
							</p>
						) : null)}
					<div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
						<div>
							<Field>
								<FieldLabel>Article</FieldLabel>
								<Select
									value={selectedItemId}
									onValueChange={(v) => {
										setSelectedItemId(v);
										setSelectedVariantId("");
										setSelectedPriceOptionId("");
									}}
									disabled={
										!reservableDates ||
										reservableData?.isRentalOpen === false ||
										variantsPending
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Choisir..." />
									</SelectTrigger>
									<SelectContent>
										{uniqueItems.map((item) => (
											<SelectItem key={item.id} value={item.id}>
												{item.name} ({item.brand})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						</div>
						<div>
							<Field>
								<FieldLabel>Variante</FieldLabel>
								<Select
									value={selectedVariantId}
									onValueChange={(v) => {
										setSelectedVariantId(v);
										setSelectedPriceOptionId("");
									}}
									disabled={!selectedItemId || filteredVariants.length <= 1}
								>
									<SelectTrigger>
										<SelectValue
											placeholder={
												!selectedItemId
													? "D'abord choisir un article"
													: filteredVariants.length === 0
														? "Aucune variante disponible"
														: "Choisir..."
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{filteredVariants.map((v) => (
											<SelectItem key={v.id} value={v.id}>
												{getVariantLabel(v, filteredVariants.length)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						</div>
						<div>
							<Field>
								{/* La durée est déjà choisie plus haut : il ne reste qu'un palier
								    tarifaire, parmi ceux qui couvrent cette durée. */}
								<FieldLabel>Prix</FieldLabel>
								<Select
									value={selectedPriceOptionId}
									onValueChange={setSelectedPriceOptionId}
									disabled={
										!selectedVariantId || filteredPriceOptions.length === 0
									}
								>
									<SelectTrigger>
										<SelectValue
											placeholder={
												!selectedVariantId
													? "D'abord choisir une variante"
													: filteredPriceOptions.length === 0 &&
															computedDuration
														? `Aucun tarif ${computedDuration}j`
														: "Choisir..."
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{filteredPriceOptions.map((o) => (
											<SelectItem key={o.id} value={o.id}>
												{o.label} — {formatPriceString(o.price)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						</div>
						<div>
							<Field>
								<FieldLabel>Quantité</FieldLabel>
								<div className="relative">
									<input
										type="number"
										min={1}
										max={effectiveAvailable || 1}
										value={quantity}
										onChange={(e) => setQuantity(Number(e.target.value))}
										className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors"
									/>
									{selectedVariantId &&
										hasDates &&
										(stockQuery.isLoading || stockQuery.data) && (
											<p
												className={`absolute -bottom-5 right-0 text-xs ${
													stockQuery.isLoading
														? "text-muted-foreground"
														: quantity > effectiveAvailable
															? "text-destructive"
															: "text-muted-foreground"
												}`}
											>
												{stockQuery.isLoading
													? "Vérification du stock..."
													: `${displayAvailable} / ${stockQuery.data?.totalStock} disponible${displayAvailable <= 1 ? "" : "s"}`}
											</p>
										)}
								</div>
							</Field>
						</div>
						<Button
							type="button"
							onClick={addItem}
							disabled={
								!selectedVariant ||
								(stockQuery.data && quantity > effectiveAvailable) ||
								!selectedPriceOption
							}
						>
							<Plus />
							Ajouter
						</Button>
					</div>

					{lineItems.length > 0 && (
						<div className="overflow-hidden rounded-lg border">
							<Table>
								<TableHeader className="bg-muted/50">
									<TableRow>
										<TableHead>Article</TableHead>
										<TableHead>Option</TableHead>
										<TableHead>Qté</TableHead>
										<TableHead>Prix unitaire</TableHead>
										<TableHead>Sous-total</TableHead>
										<TableHead />
									</TableRow>
								</TableHeader>
								<TableBody>
									{lineItems.map((item, i) => (
										<TableRow key={item.key}>
											<TableCell className="text-sm">
												{item.itemName}
												<div className="text-xs text-muted-foreground">
													{item.variantLabel}
												</div>
											</TableCell>
											<TableCell className="text-sm">
												{item.priceOptionLabel}
											</TableCell>
											<TableCell>{item.quantity}</TableCell>
											<TableCell className="font-medium">
												{formatPriceString(item.unitPrice)}
											</TableCell>
											<TableCell className="font-medium">
												{formatPriceString(
													String(
														(
															Number.parseFloat(item.unitPrice) * item.quantity
														).toFixed(2),
													),
												)}
											</TableCell>
											<TableCell>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="size-8"
													onClick={() => removeItem(i)}
												>
													<Trash2 className="size-4" />
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			<div className="flex justify-end">
				<Button
					type="submit"
					size="lg"
					disabled={
						isPending ||
						!reservableDates ||
						reservableData?.isRentalOpen === false ||
						!clientValidation.valid
					}
				>
					{isPending ? "Création en cours..." : "Créer la réservation"}
				</Button>
			</div>
		</form>
	);
}
