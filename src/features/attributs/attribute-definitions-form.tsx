import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowDown,
	ArrowUp,
	Check,
	ChevronDown,
	ChevronRight,
	Pencil,
	Plus,
	Trash2,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Field, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	type AttributeDefinitionRow,
	createAttributeDefinition,
	createAttributeValue,
	deleteAttributeDefinition,
	deleteAttributeValue,
	getAttributeDefinitions,
	setAttributeDefinitionOrder,
	updateAttributeDefinition,
	updateAttributeValue,
} from "#/features/attributs/queries";
import { queryKeys } from "#/features/attributs/query-keys";

export function AttributeDefinitionsForm() {
	const queryClient = useQueryClient();
	const { data: definitions, isPending } = useQuery({
		queryKey: queryKeys.attributs.all,
		queryFn: () => getAttributeDefinitions(),
	});

	const [newName, setNewName] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: queryKeys.attributs.all });
	const mutationError = (fallback: string) => (error: unknown) =>
		toast.error(error instanceof Error ? error.message : fallback);

	const createDefinitionMutation = useMutation({
		mutationFn: (name: string) => createAttributeDefinition({ data: { name } }),
		onSuccess: () => {
			invalidate();
			setNewName("");
			toast.success("Attribut ajouté.");
		},
		onError: mutationError("Erreur"),
	});

	const updateDefinitionMutation = useMutation({
		mutationFn: (input: { id: string; name: string }) =>
			updateAttributeDefinition({ data: input }),
		onSuccess: () => {
			invalidate();
			setEditingId(null);
			toast.success("Attribut renommé.");
		},
		onError: mutationError("Erreur"),
	});

	const deleteDefinitionMutation = useMutation({
		mutationFn: (id: string) => deleteAttributeDefinition({ data: id }),
		onSuccess: () => {
			invalidate();
			setExpandedId(null);
			toast.success("Attribut supprimé.");
		},
		onError: mutationError("Erreur"),
	});

	const orderMutation = useMutation({
		mutationFn: (ordered: AttributeDefinitionRow[]) =>
			setAttributeDefinitionOrder({
				data: ordered.map((definition, index) => ({
					id: definition.id,
					sortOrder: index + 1,
				})),
			}),
		onSuccess: invalidate,
		onError: mutationError("Impossible de modifier l'ordre"),
	});

	const move = (index: number, direction: -1 | 1) => {
		const list = [...(definitions ?? [])];
		const target = index + direction;
		if (target < 0 || target >= list.length) return;
		[list[index], list[target]] = [list[target], list[index]];
		orderMutation.mutate(list);
	};

	return (
		<div className="flex min-w-0 flex-col gap-6">
			<div>
				<h2 className="text-lg font-semibold">Attributs de variantes</h2>
				<p className="text-sm text-muted-foreground">
					Définissez les noms d'attributs (taille, volume…) et leurs valeurs
					autorisées. Le formulaire produit ne propose ensuite que cette liste,
					pour une saisie cohérente sur tous les articles.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Ajouter un attribut</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
						onSubmit={(event) => {
							event.preventDefault();
							const name = newName.trim();
							if (!name) {
								toast.error("Le nom est requis");
								return;
							}
							createDefinitionMutation.mutate(name);
						}}
					>
						<Field>
							<FieldLabel>Nom</FieldLabel>
							<Input
								value={newName}
								onChange={(event) => setNewName(event.target.value)}
								placeholder="ex : Taille, Volume, Places"
							/>
						</Field>
						<Button
							type="submit"
							className="w-full sm:w-auto"
							disabled={createDefinitionMutation.isPending}
						>
							<Plus /> Ajouter
						</Button>
					</form>
				</CardContent>
			</Card>

			{isPending ? (
				<p className="text-sm text-muted-foreground">Chargement...</p>
			) : !definitions || definitions.length === 0 ? (
				<p className="text-sm text-muted-foreground italic">
					Aucun attribut défini pour le moment.
				</p>
			) : (
				<ul className="space-y-2">
					{definitions.map((definition, index) => {
						const isUsed = definition.usageCount > 0;
						const isExpanded = expandedId === definition.id;
						return (
							<li
								key={definition.id}
								className="flex min-w-0 flex-col gap-3 rounded-md border px-4 py-3"
							>
								<div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									{editingId === definition.id ? (
										<form
											className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end"
											onSubmit={(event) => {
												event.preventDefault();
												const name = editName.trim();
												if (!name) {
													toast.error("Le nom est requis");
													return;
												}
												updateDefinitionMutation.mutate({
													id: definition.id,
													name,
												});
											}}
										>
											<Field className="min-w-0 flex-1">
												<FieldLabel>Nom</FieldLabel>
												<Input
													value={editName}
													onChange={(event) => setEditName(event.target.value)}
												/>
											</Field>
											<div className="grid grid-cols-2 gap-1 sm:flex sm:items-center">
												<Button
													type="submit"
													size="icon"
													className="size-10 sm:size-8"
													disabled={updateDefinitionMutation.isPending}
													aria-label={`Enregistrer ${definition.name}`}
												>
													<Check className="size-4" />
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="size-10 sm:size-8"
													onClick={() => setEditingId(null)}
													aria-label="Annuler la modification"
												>
													<X className="size-4" />
												</Button>
											</div>
										</form>
									) : (
										<div className="flex min-w-0 flex-col gap-1 text-sm">
											<div className="flex min-w-0 flex-wrap items-center gap-2">
												<span className="min-w-0 break-words font-medium">
													{definition.name}
												</span>
												{isUsed && (
													<Badge variant="secondary">
														{definition.usageCount} variante
														{definition.usageCount > 1 ? "s" : ""}
													</Badge>
												)}
												<Badge variant="outline">
													{definition.values.length} valeur
													{definition.values.length > 1 ? "s" : ""}
												</Badge>
											</div>
										</div>
									)}

									{editingId !== definition.id && (
										<div className="flex w-full items-center justify-end gap-1 sm:w-auto">
											<Button
												variant="ghost"
												size="icon"
												className="size-10 sm:size-8"
												onClick={() =>
													setExpandedId(isExpanded ? null : definition.id)
												}
												aria-label={`Gérer les valeurs de ${definition.name}`}
											>
												{isExpanded ? (
													<ChevronDown className="size-4" />
												) : (
													<ChevronRight className="size-4" />
												)}
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="size-10 sm:size-8"
												disabled={index === 0 || orderMutation.isPending}
												onClick={() => move(index, -1)}
												aria-label={`Déplacer ${definition.name} vers le haut`}
											>
												<ArrowUp className="size-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="size-10 sm:size-8"
												disabled={
													index === definitions.length - 1 ||
													orderMutation.isPending
												}
												onClick={() => move(index, 1)}
												aria-label={`Déplacer ${definition.name} vers le bas`}
											>
												<ArrowDown className="size-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="size-10 sm:size-8"
												onClick={() => {
													setEditingId(definition.id);
													setEditName(definition.name);
												}}
												aria-label={`Renommer ${definition.name}`}
											>
												<Pencil className="size-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="size-10 text-destructive sm:size-8"
												disabled={isUsed || deleteDefinitionMutation.isPending}
												onClick={() => {
													if (
														window.confirm(
															`Supprimer l'attribut « ${definition.name} » ?`,
														)
													) {
														deleteDefinitionMutation.mutate(definition.id);
													}
												}}
												aria-label={`Supprimer ${definition.name}`}
											>
												<Trash2 className="size-4" />
											</Button>
										</div>
									)}
								</div>

								{isExpanded && <DefinitionValues definition={definition} />}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

function DefinitionValues({
	definition,
}: {
	definition: AttributeDefinitionRow;
}) {
	const queryClient = useQueryClient();
	const [newValue, setNewValue] = useState("");
	const [editingValueId, setEditingValueId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: queryKeys.attributs.all });
	const mutationError = (fallback: string) => (error: unknown) =>
		toast.error(error instanceof Error ? error.message : fallback);

	const createValueMutation = useMutation({
		mutationFn: (value: string) =>
			createAttributeValue({ data: { definitionId: definition.id, value } }),
		onSuccess: () => {
			invalidate();
			setNewValue("");
			toast.success(`Valeur « ${newValue} » ajoutée.`);
		},
		onError: mutationError("Erreur"),
	});

	const updateValueMutation = useMutation({
		mutationFn: (input: { id: string; value: string }) =>
			updateAttributeValue({ data: input }),
		onSuccess: () => {
			invalidate();
			setEditingValueId(null);
			toast.success("Valeur modifiée.");
		},
		onError: mutationError("Erreur"),
	});

	const deleteValueMutation = useMutation({
		mutationFn: (id: string) => deleteAttributeValue({ data: id }),
		onSuccess: () => {
			invalidate();
			toast.success("Valeur supprimée.");
		},
		onError: mutationError("Erreur"),
	});

	return (
		<div className="flex flex-col gap-3 border-t pt-3">
			<form
				className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end"
				onSubmit={(event) => {
					event.preventDefault();
					const value = newValue.trim();
					if (!value) {
						toast.error("La valeur est requise");
						return;
					}
					createValueMutation.mutate(value);
				}}
			>
				<Field className="min-w-0 flex-1">
					<FieldLabel>Ajouter une valeur à « {definition.name} »</FieldLabel>
					<Input
						value={newValue}
						onChange={(event) => setNewValue(event.target.value)}
						placeholder="ex : M, 40L, 2"
					/>
				</Field>
				<Button
					type="submit"
					size="sm"
					className="w-full sm:w-auto"
					disabled={createValueMutation.isPending}
				>
					<Plus /> Ajouter
				</Button>
			</form>

			{definition.values.length === 0 ? (
				<p className="text-sm text-muted-foreground italic">
					Aucune valeur pour le moment.
				</p>
			) : (
				<ul className="flex flex-wrap gap-2">
					{definition.values.map((value) => {
						const isValueUsed = value.usageCount > 0;
						return (
							<li
								key={value.id}
								className="flex items-center gap-1 rounded-md border px-2 py-1"
							>
								{editingValueId === value.id ? (
									<form
										className="flex items-center gap-1"
										onSubmit={(event) => {
											event.preventDefault();
											const next = editValue.trim();
											if (!next) {
												toast.error("La valeur est requise");
												return;
											}
											updateValueMutation.mutate({
												id: value.id,
												value: next,
											});
										}}
									>
										<Input
											value={editValue}
											onChange={(event) => setEditValue(event.target.value)}
											className="h-8 w-24"
										/>
										<Button
											type="submit"
											size="icon"
											className="size-8"
											disabled={updateValueMutation.isPending}
											aria-label="Enregistrer la valeur"
										>
											<Check className="size-4" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-8"
											onClick={() => setEditingValueId(null)}
											aria-label="Annuler la modification"
										>
											<X className="size-4" />
										</Button>
									</form>
								) : (
									<>
										<span className="text-sm">{value.value}</span>
										{isValueUsed && (
											<Badge variant="secondary" className="text-[10px]">
												{value.usageCount}
											</Badge>
										)}
										<Button
											variant="ghost"
											size="icon"
											className="size-7"
											onClick={() => {
												setEditingValueId(value.id);
												setEditValue(value.value);
											}}
											aria-label={`Modifier la valeur ${value.value}`}
										>
											<Pencil className="size-3.5" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="size-7 text-destructive"
											disabled={isValueUsed || deleteValueMutation.isPending}
											onClick={() => {
												if (
													window.confirm(
														`Supprimer la valeur « ${value.value} » ?`,
													)
												) {
													deleteValueMutation.mutate(value.id);
												}
											}}
											aria-label={`Supprimer la valeur ${value.value}`}
										>
											<Trash2 className="size-3.5" />
										</Button>
									</>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
