import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { Field, FieldLabel } from "#/components/ui/field";
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
import { getVariants } from "#/features/equipements/queries";
import {
	type CreateReservationInput,
	createReservation,
	getAvailableStock,
} from "#/features/reservations/queries";
import { queryKeys as reservationQueryKeys } from "#/features/reservations/query-keys";
import {
	type CreateUserInput,
	createUser,
	getUsers,
} from "#/features/users/queries";
import { queryKeys } from "#/features/users/query-keys";

export const Route = createFileRoute("/admin/_layout/reservations/ajouter")({
	component: RouteComponent,
});

const formatPrice = (val: string | null) => {
	if (!val) return "—";
	return `${parseFloat(val).toFixed(2).replace(".", ",")} €`;
};

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
			priceOptionLabel: string;
			unitPrice: string;
		}>
	>([]);

	const { data: users } = useQuery({
		queryKey: queryKeys.users.all,
		queryFn: () => getUsers({ data: {} }),
	});

	const { data: allVariants } = useQuery({
		queryKey: ["equipements", "variants"],
		queryFn: () => getVariants(),
	});

	const selectedVariant = useMemo(
		() => allVariants?.find((v) => v.id === selectedVariantId),
		[allVariants, selectedVariantId],
	);

	const selectedPriceOption = useMemo(() => {
		if (selectedVariant?.pricingMode === "per_day") return null;
		return (
			selectedVariant?.priceOptions.find(
				(o) => o.id === selectedPriceOptionId,
			) ?? null
		);
	}, [selectedVariant, selectedPriceOptionId]);

	const computedDuration = useMemo(() => {
		if (!pickupDate || !returnDate) return null;
		const pickup = new Date(`${pickupDate}T00:00:00.000`);
		const retour = new Date(`${returnDate}T23:59:59.999`);
		const diffMs = retour.getTime() - pickup.getTime();
		if (diffMs <= 0) return null;
		return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
	}, [pickupDate, returnDate]);

	const perDayPrice = useMemo(() => {
		if (
			selectedVariant?.pricingMode !== "per_day" ||
			!computedDuration ||
			!selectedVariant.dailyPrice
		) {
			return null;
		}
		return Number.parseFloat(selectedVariant.dailyPrice) * computedDuration;
	}, [selectedVariant, computedDuration]);

	useEffect(() => {
		if (
			!selectedVariant ||
			selectedVariant.pricingMode !== "per_duration" ||
			!computedDuration
		) {
			setSelectedPriceOptionId("");
			return;
		}
		const match = selectedVariant.priceOptions.find(
			(o) => o.duration === computedDuration,
		);
		setSelectedPriceOptionId(match?.id ?? "");
	}, [selectedVariant, computedDuration]);

	const filteredPriceOptions = useMemo(() => {
		if (selectedVariant?.pricingMode !== "per_duration") return [];
		if (!computedDuration) return selectedVariant.priceOptions;
		return selectedVariant.priceOptions.filter(
			(o) => o.duration === computedDuration,
		);
	}, [selectedVariant, computedDuration]);

	const hasDates = pickupDate && returnDate;

	const stockQuery = useQuery({
		queryKey: ["stock", selectedVariantId, pickupDate, returnDate],
		queryFn: () =>
			getAvailableStock({
				data: {
					variantId: selectedVariantId,
					pickupDate: new Date(`${pickupDate}T00:00:00.000`).toISOString(),
					returnDate: new Date(`${returnDate}T23:59:59.999`).toISOString(),
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

	const addItem = () => {
		if (!selectedVariant) return;

		if (selectedVariant.pricingMode === "per_day") {
			if (!computedDuration || !perDayPrice) return;
			setLineItems((prev) => [
				...prev,
				{
					key: crypto.randomUUID(),
					variantId: selectedVariant.id,
					priceOptionId: null,
					quantity,
					itemName: selectedVariant.itemName,
					priceOptionLabel: `${computedDuration} jour${
						computedDuration > 1 ? "s" : ""
					} · ${Number.parseFloat(selectedVariant.dailyPrice).toFixed(2)} €/j`,
					unitPrice: perDayPrice.toFixed(2),
				},
			]);
		} else {
			if (!selectedPriceOption) return;
			setLineItems((prev) => [
				...prev,
				{
					key: crypto.randomUUID(),
					variantId: selectedVariant.id,
					priceOptionId: selectedPriceOption.id,
					quantity,
					itemName: selectedVariant.itemName,
					priceOptionLabel: selectedPriceOption.label,
					unitPrice: selectedPriceOption.price,
				},
			]);
		}
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

		const pickup = new Date(`${pickupDate}T00:00:00.000`);
		const returnD = new Date(`${returnDate}T23:59:59.999`);

		if (returnD <= pickup) {
			toast.error("La date de retour doit être après la date de retrait");
			return;
		}

		let userId = selectedUserId;

		if (clientMode === "new") {
			if (!newName || !newEmail || !newPhone) {
				toast.error("Veuillez remplir le nom, l'email et le téléphone");
				return;
			}
			try {
				const created = await createUserMutation.mutateAsync({
					name: newName,
					email: newEmail,
					phone: newPhone,
					loyaltyCard: newLoyaltyCard || undefined,
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
		} else {
			if (!userId) {
				toast.error("Veuillez sélectionner un client");
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

			<Card>
				<CardHeader>
					<CardTitle>Client</CardTitle>
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
							<FieldLabel>Sélectionner un client</FieldLabel>
							<Combobox
								items={users ?? []}
								value={selectedUserId}
								onValueChange={handleSelect}
							>
								<ComboboxInput
									placeholder="Rechercher un client..."
									value={searchClient}
									onChange={(e) => setSearchClient(e.target.value)}
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
							<Select value={selectedUserId} onValueChange={setSelectedUserId}>
								<SelectTrigger>
									<SelectValue placeholder="Choisir un client..." />
								</SelectTrigger>
								<SelectContent>
									{users?.map((u) => (
										<SelectItem key={u.id} value={u.id}>
											{u.name} — {u.email}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					) : (
						<div className="grid grid-cols-2 gap-4">
							<Field>
								<FieldLabel>Nom *</FieldLabel>
								<Input
									value={newName}
									onChange={(e) => setNewName(e.target.value)}
									placeholder="Prénom et nom"
								/>
							</Field>
							<Field>
								<FieldLabel>Email *</FieldLabel>
								<Input
									type="email"
									value={newEmail}
									onChange={(e) => setNewEmail(e.target.value)}
									placeholder="client@example.com"
								/>
							</Field>
							<Field>
								<FieldLabel>Téléphone *</FieldLabel>
								<Input
									type="tel"
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
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Dates</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4">
					<Field>
						<FieldLabel>Date de retrait</FieldLabel>
						<input
							type="date"
							value={pickupDate}
							onChange={(e) => setPickupDate(e.target.value)}
							className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors"
						/>
					</Field>
					<Field>
						<FieldLabel>Date de retour</FieldLabel>
						<input
							type="date"
							value={returnDate}
							onChange={(e) => setReturnDate(e.target.value)}
							className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors"
						/>
					</Field>
					{computedDuration && (
						<p className="text-sm text-muted-foreground col-span-2 -mt-2">
							Durée : {computedDuration} jour{computedDuration > 1 ? "s" : ""}
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle>Articles</CardTitle>
					<Badge variant="secondary" className="text-sm">
						Total : {formatPrice(String(totalPrice.toFixed(2)))}
					</Badge>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-5 gap-3 items-end">
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
									disabled={!selectedItemId}
								>
									<SelectTrigger>
										<SelectValue
											placeholder={
												selectedItemId
													? "Choisir..."
													: "D'abord choisir un article"
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{filteredVariants.map((v) => (
											<SelectItem key={v.id} value={v.id}>
												{v.attributes.map((a) => a.value).join(" / ") ||
													v.decathlonSku ||
													"Par défaut"}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						</div>
						<div>
							{selectedVariant?.pricingMode === "per_day" ? (
								<Field>
									<FieldLabel>Prix (à la journée)</FieldLabel>
									<Input
										readOnly
										value={
											perDayPrice
												? `Durée ${computedDuration}j · ${formatPrice(
														perDayPrice.toFixed(2),
													)}`
												: "Renseignez les dates"
										}
									/>
								</Field>
							) : (
								<Field>
									<FieldLabel>Durée / Prix</FieldLabel>
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
													{o.label} — {formatPrice(o.price)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
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
										className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors"
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
								(selectedVariant.pricingMode === "per_duration" &&
									!selectedPriceOption) ||
								(selectedVariant.pricingMode === "per_day" &&
									(!computedDuration || !perDayPrice))
							}
						>
							<Plus />
							Ajouter
						</Button>
					</div>

					{lineItems.length > 0 && (
						<Table>
							<TableHeader className="bg-muted">
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
										<TableCell className="text-sm">{item.itemName}</TableCell>
										<TableCell className="text-sm">
											{item.priceOptionLabel}
										</TableCell>
										<TableCell>{item.quantity}</TableCell>
										<TableCell className="font-medium">
											{formatPrice(item.unitPrice)}
										</TableCell>
										<TableCell className="font-medium">
											{formatPrice(
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
					)}
				</CardContent>
			</Card>

			<div className="flex justify-end">
				<Button type="submit" size="lg" disabled={isPending}>
					{isPending ? "Création en cours..." : "Créer la réservation"}
				</Button>
			</div>
		</form>
	);
}
