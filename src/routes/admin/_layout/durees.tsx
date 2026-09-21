import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/admin/_layout/durees")({
	loader: async ({ context: { queryClient } }) => {
		await queryClient.prefetchQuery({
			queryKey: queryKeys.durees.all,
			queryFn: () => getRentalDurations(),
		});
	},
	component: RouteComponent,
});

function RouteComponent() {
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

	const createMutation = useMutation({
		mutationFn: (input: { label: string; days: number }) =>
			createRentalDuration({ data: input }),
		onSuccess: () => {
			invalidate();
			setNewLabel("");
			setNewDays(1);
			toast.success("Durée ajoutée.");
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Erreur"),
	});

	const updateMutation = useMutation({
		mutationFn: (input: { id: string; label: string; days: number }) =>
			updateRentalDuration({ data: input }),
		onSuccess: () => {
			invalidate();
			setEditingId(null);
			toast.success("Durée modifiée.");
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Erreur"),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteRentalDuration({ data: id }),
		onSuccess: () => {
			invalidate();
			toast.success("Durée supprimée.");
		},
	});

	const orderMutation = useMutation({
		mutationFn: (ordered: RentalDurationRow[]) =>
			setRentalDurationOrder({
				data: ordered.map((d, i) => ({ id: d.id, sortOrder: i + 1 })),
			}),
		onSuccess: invalidate,
	});

	const move = (index: number, direction: -1 | 1) => {
		const list = [...(durees ?? [])];
		const target = index + direction;
		if (index < 0 || target < 0 || target >= list.length) return;
		const temp = list[index];
		list[index] = list[target];
		list[target] = temp;
		orderMutation.mutate(list);
	};

	const startEdit = (d: RentalDurationRow) => {
		setEditingId(d.id);
		setEditLabel(d.label);
		setEditDays(d.days);
	};

	if (isPending) {
		return <div className="text-sm text-muted-foreground">Chargement...</div>;
	}

	return (
		<div className="flex flex-col gap-6">
			<h2 className="text-lg font-semibold">Durées de location</h2>
			<p className="text-sm text-muted-foreground">
				Ces durées sont proposées lors de la création des tarifs par durée des
				articles. Chaque durée s'applique à l'ensemble de l'établissement.
			</p>

			<Card>
				<CardHeader>
					<CardTitle>Ajouter une durée</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						className="flex items-end gap-3"
						onSubmit={(e) => {
							e.preventDefault();
							const label = newLabel.trim();
							if (!label) {
								toast.error("Le libellé est requis");
								return;
							}
							createMutation.mutate({ label, days: newDays });
						}}
					>
						<div className="flex-1">
							<Field>
								<FieldLabel>Libellé</FieldLabel>
								<Input
									value={newLabel}
									onChange={(e) => setNewLabel(e.target.value)}
									placeholder="ex : 1 jour, 1 semaine"
								/>
							</Field>
						</div>
						<div className="w-40">
							<Field>
								<FieldLabel>Nombre de jours</FieldLabel>
								<Input
									type="number"
									min={1}
									value={newDays}
									onChange={(e) =>
										setNewDays(Math.max(1, Number(e.target.value)))
									}
								/>
							</Field>
						</div>
						<Button type="submit" disabled={createMutation.isPending}>
							<Plus /> Ajouter
						</Button>
					</form>
				</CardContent>
			</Card>

			{!durees || durees.length === 0 ? (
				<p className="text-sm text-muted-foreground italic">
					Aucune durée définie pour le moment.
				</p>
			) : (
				<ul className="space-y-2">
					{durees.map((d, index) => (
						<li
							key={d.id}
							className="flex items-center justify-between rounded-md border px-4 py-3"
						>
							{editingId === d.id ? (
								<form
									className="flex items-end gap-3 flex-1"
									onSubmit={(e) => {
										e.preventDefault();
										const label = editLabel.trim();
										if (!label) {
											toast.error("Le libellé est requis");
											return;
										}
										updateMutation.mutate({
											id: d.id,
											label,
											days: editDays,
										});
									}}
								>
									<div className="flex-1">
										<Field>
											<FieldLabel>Libellé</FieldLabel>
											<Input
												value={editLabel}
												onChange={(e) => setEditLabel(e.target.value)}
											/>
										</Field>
									</div>
									<div className="w-40">
										<Field>
											<FieldLabel>Jours</FieldLabel>
											<Input
												type="number"
												min={1}
												value={editDays}
												onChange={(e) =>
													setEditDays(Math.max(1, Number(e.target.value)))
												}
											/>
										</Field>
									</div>
									<div className="flex items-center gap-1">
										<Button
											type="submit"
											size="icon"
											className="size-8"
											disabled={updateMutation.isPending}
										>
											<Check className="size-4" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-8"
											onClick={() => setEditingId(null)}
										>
											<X className="size-4" />
										</Button>
									</div>
								</form>
							) : (
								<>
									<div className="flex items-center gap-3 text-sm">
										<span className="font-medium">{d.label}</span>
										<span className="text-muted-foreground">
											{d.days} jour{d.days > 1 ? "s" : ""}
										</span>
									</div>
									<div className="flex items-center gap-1">
										<Button
											variant="ghost"
											size="icon"
											className="size-8"
											disabled={index === 0}
											onClick={() => move(index, -1)}
										>
											<ArrowUp className="size-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="size-8"
											disabled={index === (durees.length ?? 0) - 1}
											onClick={() => move(index, 1)}
										>
											<ArrowDown className="size-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="size-8"
											onClick={() => startEdit(d)}
										>
											<Pencil className="size-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="size-8 text-destructive"
											onClick={() => {
												const label = d.label;
												if (
													window.confirm(`Supprimer la durée « ${label} » ?`)
												) {
													deleteMutation.mutate(d.id);
												}
											}}
										>
											<Trash2 className="size-4" />
										</Button>
									</div>
								</>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
