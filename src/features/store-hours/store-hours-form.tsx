import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Field, FieldContent, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import {
	type UpdateStoreHoursInput,
	updateStoreHours,
} from "#/features/store-hours/queries";
import { storeHoursKeys } from "#/features/store-hours/query-keys";
import {
	normalizeStoreHours,
	type StoreHours,
} from "#/features/store-hours/types";

/** Un jour en cours de saisie, avant conversion vers le format du serveur. */
type DayDraft = {
	day: number;
	label: string;
	isOpen: boolean;
	morningFrom: string;
	morningTo: string;
	afternoonFrom: string;
	afternoonTo: string;
};

/**
 * Les sept jours dans l'ordre où la table vient, où `slots` est aplati en
 * colonnes : le formulaire n'a ainsi jamais à reconstruire un jour depuis zéro,
 * et un créneau absent reste absent plutôt que de réapparaître à 00:00.
 */
function toDrafts(hours: StoreHours): DayDraft[] {
	return normalizeStoreHours(hours).map((day) => ({
		day: day.day,
		label: day.label,
		isOpen: day.isOpen,
		morningFrom: day.slots[0]?.opens ?? "",
		morningTo: day.slots[0]?.closes ?? "",
		// Un troisième créneau n'existe pas dans la table : seul le premier
		// occupe l'après-midi, ce qui évite d'ouvrir une plage que le modèle
		// ne saurait pas rendre.
		afternoonFrom: day.slots[1]?.opens ?? "",
		afternoonTo: day.slots[1]?.closes ?? "",
	}));
}

/** Une saisie est exploitable si chaque créneau a ses deux bornes. */
function slotIncomplete(draft: DayDraft): boolean {
	const halfFilled = (from: string, to: string) =>
		Boolean(from) !== Boolean(to);
	return (
		halfFilled(draft.morningFrom, draft.morningTo) ||
		halfFilled(draft.afternoonFrom, draft.afternoonTo)
	);
}

export function StoreHoursForm({ hours }: { hours: StoreHours }) {
	const queryClient = useQueryClient();
	const [drafts, setDrafts] = useState<DayDraft[]>(() => toDrafts(hours));

	const update = (day: number, patch: Partial<DayDraft>) => {
		setDrafts((current) =>
			current.map((draft) =>
				draft.day === day ? { ...draft, ...patch } : draft,
			),
		);
	};

	const saveMutation = useMutation({
		mutationFn: (input: UpdateStoreHoursInput) =>
			updateStoreHours({ data: input }),
		onSuccess: (updated) => {
			queryClient.setQueryData(storeHoursKeys.all, updated);
			// Le calendrier public et le pied de page lisent les horaires : sans
			// invalidation, un jour fermé par l'admin continuerait d'être proposé
			// au client jusqu'à expiration du cache.
			queryClient.invalidateQueries({ queryKey: ["public", "store-schedule"] });
			queryClient.invalidateQueries({
				queryKey: ["equipements", "variants", "reservable"],
			});
			setDrafts(toDrafts(updated));
			toast.success("Horaires enregistrés.");
		},
		onError: (error) =>
			toast.error(error instanceof Error ? error.message : "Erreur"),
	});

	const handleSave = () => {
		saveMutation.mutate({
			days: drafts.map((draft) => ({
				day: draft.day,
				label: draft.label,
				isOpen: draft.isOpen,
				morning:
					draft.morningFrom || draft.morningTo
						? { from: draft.morningFrom, to: draft.morningTo }
						: null,
				afternoon:
					draft.afternoonFrom || draft.afternoonTo
						? { from: draft.afternoonFrom, to: draft.afternoonTo }
						: null,
			})),
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Horaires d’ouverture</CardTitle>
				<CardDescription>
					Ces horaires déterminent les jours où un retrait ou un retour est
					possible, et sont publiés sur le site et dans les données Google.
					Laissez l’après-midi vide pour une fermeture de midi.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{drafts.map((draft) => (
					<Field
						key={draft.day}
						orientation="horizontal"
						className="items-start gap-3 sm:items-center"
					>
						<FieldContent className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<FieldLabel>{draft.label}</FieldLabel>
								{draft.isOpen && slotIncomplete(draft) && (
									<p className="text-xs text-amber-700 dark:text-amber-400">
										Créneau incomplet : une heure de début sans heure de fin.
									</p>
								)}
							</div>
							{draft.isOpen ? (
								<div className="mt-2 flex flex-wrap items-center gap-2">
									<TimeSlot
										label={`Ouverture ${draft.label}`}
										from={draft.morningFrom}
										to={draft.morningTo}
										onChange={(from, to) =>
											update(draft.day, {
												morningFrom: from,
												morningTo: to,
											})
										}
									/>
									<span aria-hidden="true" className="text-muted-foreground">
										→
									</span>
									<TimeSlot
										label={`Fermeture ${draft.label}`}
										from={draft.afternoonFrom}
										to={draft.afternoonTo}
										onChange={(from, to) =>
											update(draft.day, {
												afternoonFrom: from,
												afternoonTo: to,
											})
										}
									/>
								</div>
							) : (
								<p className="mt-1 text-sm text-muted-foreground">
									Fermé : aucun retrait ni retour ce jour-là.
								</p>
							)}
						</FieldContent>
						<Switch
							checked={draft.isOpen}
							onCheckedChange={(isOpen) => update(draft.day, { isOpen })}
							aria-label={`${draft.isOpen ? "Fermer" : "Ouvrir"} le ${draft.label}`}
						/>
					</Field>
				))}

				<Button
					type="button"
					onClick={handleSave}
					disabled={saveMutation.isPending || drafts.some(slotIncomplete)}
					className="sm:self-end"
				>
					<Save /> Enregistrer
				</Button>
			</CardContent>
		</Card>
	);
}

/** Une plage d'horaires : deux champs heure reliés par un tiret. */
function TimeSlot({
	label,
	from,
	to,
	onChange,
}: {
	label: string;
	from: string;
	to: string;
	onChange: (from: string, to: string) => void;
}) {
	return (
		<div className="flex items-center gap-1.5">
			<Input
				type="time"
				step={300}
				value={from}
				aria-label={`${label} — de`}
				onChange={(event) => onChange(event.target.value, to)}
				className="w-28"
			/>
			<span aria-hidden="true" className="text-muted-foreground">
				–
			</span>
			<Input
				type="time"
				step={300}
				value={to}
				aria-label={`${label} — à`}
				onChange={(event) => onChange(from, event.target.value)}
				className="w-28"
			/>
		</div>
	);
}
