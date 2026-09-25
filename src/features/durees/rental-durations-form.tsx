import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowDown,
	ArrowUp,
	Check,
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
	createRentalDuration,
	deleteRentalDuration,
	getRentalDurations,
	type RentalDurationRow,
	setRentalDurationOrder,
	updateRentalDuration,
} from "#/features/durees/queries";
import { queryKeys } from "#/features/durees/query-keys";

export function RentalDurationsForm() {
	const queryClient = useQueryClient();
	const { data: durees, isPending } = useQuery({
		queryKey: queryKeys.durees.all,
		queryFn: () => getRentalDurations(),
	});

	const [newLabel, setNewLabel] = useState("");
	const [newDays, setNewDays] = useState(1);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editLabel, setEditLabel] = useState("");
	const [editDays, setEditDays] = useState(1);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: queryKeys.durees.all });
	const mutationError = (fallback: string) => (error: unknown) =>
		toast.error(error instanceof Error ? error.message : fallback);

	const createMutation = useMutation({
		mutationFn: (input: { label: string; days: number }) =>
			createRentalDuration({ data: input }),
		onSuccess: () => {
			invalidate();
			setNewLabel("");
			setNewDays(1);
			toast.success("Durée ajoutée.");
		},
		onError: mutationError("Erreur"),
	});

	const updateMutation = useMutation({
		mutationFn: (input: { id: string; label: string; days: number }) =>
			updateRentalDuration({ data: input }),
		onSuccess: () => {
			invalidate();
			setEditingId(null);
			toast.success("Durée modifiée.");
		},
		onError: mutationError("Erreur"),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteRentalDuration({ data: id }),
		onSuccess: () => {
			invalidate();
			toast.success("Durée supprimée.");
		},
		onError: mutationError("Erreur"),
	});

	const orderMutation = useMutation({
		mutationFn: (ordered: RentalDurationRow[]) =>
			setRentalDurationOrder({
				data: ordered.map((duration, index) => ({
					id: duration.id,
					sortOrder: index + 1,
				})),
			}),
		onSuccess: invalidate,
		onError: mutationError("Impossible de modifier l’ordre"),
	});

	const move = (index: number, direction: -1 | 1) => {
		const list = [...(durees ?? [])];
		const target = index + direction;
		if (target < 0 || target >= list.length) return;
		[list[index], list[target]] = [list[target], list[index]];
		orderMutation.mutate(list);
	};

	const startEdit = (duration: RentalDurationRow) => {
		setEditingId(duration.id);
		setEditLabel(duration.label);
		setEditDays(duration.days);
	};

	return (
		<div className="flex min-w-0 flex-col gap-6">
			<div>
				<h2 className="text-lg font-semibold">Durées de location</h2>
				<p className="text-sm text-muted-foreground">
					Ces durées alimentent les options de prix par durée de chaque article.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Ajouter une durée</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
						onSubmit={(event) => {
							event.preventDefault();
							const label = newLabel.trim();
							if (!label) {
								toast.error("Le libellé est requis");
								return;
							}
							createMutation.mutate({ label, days: newDays });
						}}
					>
						<Field>
							<FieldLabel>Libellé</FieldLabel>
							<Input
								value={newLabel}
								onChange={(event) => setNewLabel(event.target.value)}
								placeholder="ex : 1 jour, 1 semaine"
							/>
						</Field>
						<Field>
							<FieldLabel>Nombre de jours</FieldLabel>
							<Input
								type="number"
								min={1}
								value={newDays}
								onChange={(event) =>
									setNewDays(Math.max(1, Number(event.target.value)))
								}
							/>
						</Field>
						<Button
							type="submit"
							className="w-full sm:w-auto"
							disabled={createMutation.isPending}
						>
							<Plus /> Ajouter
						</Button>
					</form>
				</CardContent>
			</Card>

			{isPending ? (
				<p className="text-sm text-muted-foreground">Chargement...</p>
			) : !durees || durees.length === 0 ? (
				<p className="text-sm text-muted-foreground italic">
					Aucune durée définie pour le moment.
				</p>
			) : (
				<ul className="space-y-2">
					{durees.map((duration, index) => {
						const isUsed = duration.usageCount > 0;
						return (
							<li
								key={duration.id}
								className="flex min-w-0 flex-col gap-3 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
							>
								{editingId === duration.id ? (
									<form
										className="grid w-full min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
										onSubmit={(event) => {
											event.preventDefault();
											const label = editLabel.trim();
											if (!label) {
												toast.error("Le libellé est requis");
												return;
											}
											updateMutation.mutate({
												id: duration.id,
												label,
												days: editDays,
											});
										}}
									>
										<Field>
											<FieldLabel>Libellé</FieldLabel>
											<Input
												value={editLabel}
												onChange={(event) => setEditLabel(event.target.value)}
											/>
										</Field>
										<Field>
											<FieldLabel>Jours</FieldLabel>
											<Input
												type="number"
												min={1}
												value={editDays}
												disabled={isUsed}
												onChange={(event) =>
													setEditDays(Math.max(1, Number(event.target.value)))
												}
											/>
										</Field>
										<div className="grid grid-cols-2 gap-1 sm:flex sm:items-center">
											<Button
												type="submit"
												size="icon"
												className="size-10 sm:size-8"
												disabled={updateMutation.isPending}
												aria-label={`Enregistrer ${duration.label}`}
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
									<>
										<div className="flex min-w-0 flex-col gap-1 text-sm">
											<div className="flex min-w-0 flex-wrap items-center gap-2">
												<span className="min-w-0 break-words font-medium">
													{duration.label}
												</span>
												<span className="text-muted-foreground">
													{duration.days} jour{duration.days > 1 ? "s" : ""}
												</span>
												{isUsed && (
													<Badge variant="secondary">
														{duration.usageCount} tarif
														{duration.usageCount > 1 ? "s" : ""}
													</Badge>
												)}
											</div>
											{isUsed && (
												<p className="text-xs text-muted-foreground">
													Le nombre de jours ne peut plus être modifié.
												</p>
											)}
										</div>
										<div className="flex w-full items-center justify-end gap-1 sm:w-auto">
											<Button
												variant="ghost"
												size="icon"
												className="size-10 sm:size-8"
												disabled={index === 0 || orderMutation.isPending}
												onClick={() => move(index, -1)}
												aria-label={`Déplacer ${duration.label} vers le haut`}
											>
												<ArrowUp className="size-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="size-10 sm:size-8"
												disabled={
													index === durees.length - 1 || orderMutation.isPending
												}
												onClick={() => move(index, 1)}
												aria-label={`Déplacer ${duration.label} vers le bas`}
											>
												<ArrowDown className="size-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="size-10 sm:size-8"
												onClick={() => startEdit(duration)}
												aria-label={`Modifier ${duration.label}`}
											>
												<Pencil className="size-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="size-10 text-destructive sm:size-8"
												disabled={isUsed || deleteMutation.isPending}
												onClick={() => {
													if (
														window.confirm(
															`Supprimer la durée « ${duration.label} » ?`,
														)
													) {
														deleteMutation.mutate(duration.id);
													}
												}}
												aria-label={`Supprimer ${duration.label}`}
											>
												<Trash2 className="size-4" />
											</Button>
										</div>
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
