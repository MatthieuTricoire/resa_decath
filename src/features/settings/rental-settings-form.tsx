import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DateRangePicker } from "#/components/forms/date-range-picker";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Field, FieldContent, FieldLabel } from "#/components/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import {
	type RentalSettings,
	type UpdateRentalSettingsInput,
	updateRentalSettings,
} from "#/features/settings/queries";
import { queryKeys } from "#/features/settings/query-keys";

export function RentalSettingsForm({ settings }: { settings: RentalSettings }) {
	const queryClient = useQueryClient();
	const [seasonalFilteringEnabled, setSeasonalFilteringEnabled] = useState(
		settings.seasonalFilteringEnabled,
	);
	const [isRentalOpen, setIsRentalOpen] = useState(settings.isRentalOpen);
	const [seasonOverride, setSeasonOverride] = useState(settings.seasonOverride);
	const [summerFrom, setSummerFrom] = useState(settings.summerFrom ?? "");
	const [summerTo, setSummerTo] = useState(settings.summerTo ?? "");
	const [winterFrom, setWinterFrom] = useState(settings.winterFrom ?? "");
	const [winterTo, setWinterTo] = useState(settings.winterTo ?? "");

	const saveMutation = useMutation({
		mutationFn: (input: UpdateRentalSettingsInput) =>
			updateRentalSettings({ data: input }),
		onSuccess: (updated) => {
			queryClient.setQueryData(queryKeys.settings.all, updated);
			queryClient.invalidateQueries({
				queryKey: ["equipements", "variants", "reservable"],
			});
			toast.success("Réglages de disponibilité enregistrés.");
		},
		onError: (error) =>
			toast.error(error instanceof Error ? error.message : "Erreur"),
	});

	const handleSave = () => {
		saveMutation.mutate({
			seasonalFilteringEnabled,
			isRentalOpen,
			seasonOverride,
			summerFrom,
			summerTo,
			winterFrom,
			winterTo,
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Disponibilité des locations</CardTitle>
				<CardDescription>
					Ces règles déterminent les articles proposés lors de la création d’une
					réservation.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<Field orientation="horizontal" className="items-start sm:items-center">
					<FieldContent>
						<FieldLabel>Locations ouvertes</FieldLabel>
						<p className="text-sm text-muted-foreground">
							Désactive la création de nouvelles réservations sans masquer le
							catalogue.
						</p>
					</FieldContent>
					<Switch
						checked={isRentalOpen}
						onCheckedChange={setIsRentalOpen}
						aria-label="Activer ou désactiver les locations"
					/>
				</Field>

				<Field orientation="horizontal" className="items-start sm:items-center">
					<FieldContent>
						<FieldLabel>Filtrage saisonnier</FieldLabel>
						<p className="text-sm text-muted-foreground">
							Les produits « Toutes saisons » restent toujours disponibles, hors
							période exceptionnelle et stock.
						</p>
					</FieldContent>
					<Switch
						checked={seasonalFilteringEnabled}
						onCheckedChange={setSeasonalFilteringEnabled}
						aria-label="Activer le filtrage saisonnier"
					/>
				</Field>

				<Field>
					<FieldLabel>Saison utilisée</FieldLabel>
					<Select
						value={seasonOverride}
						disabled={!seasonalFilteringEnabled}
						onValueChange={(value) =>
							setSeasonOverride(value as typeof seasonOverride)
						}
					>
						<SelectTrigger className="w-full sm:w-64">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="auto">Automatique</SelectItem>
							<SelectItem value="summer">Forcer l’été</SelectItem>
							<SelectItem value="winter">Forcer l’hiver</SelectItem>
						</SelectContent>
					</Select>
				</Field>

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<DateRangePicker
						label="Période estivale"
						valueFrom={summerFrom}
						valueTo={summerTo}
						disabled={!seasonalFilteringEnabled}
						onChange={(from, to) => {
							setSummerFrom(from);
							setSummerTo(to);
						}}
					/>
					<DateRangePicker
						label="Période hivernale"
						valueFrom={winterFrom}
						valueTo={winterTo}
						disabled={!seasonalFilteringEnabled}
						onChange={(from, to) => {
							setWinterFrom(from);
							setWinterTo(to);
						}}
					/>
				</div>

				{seasonOverride === "auto" && seasonalFilteringEnabled && (
					<p className="text-sm text-muted-foreground">
						En mode automatique, une saison n’est appliquée que lorsque ses deux
						dates sont configurées. Les périodes peuvent se chevaucher ou
						traverser décembre.
					</p>
				)}

				<Button
					type="button"
					onClick={handleSave}
					disabled={saveMutation.isPending}
					className="sm:self-end"
				>
					<Save /> Enregistrer
				</Button>
			</CardContent>
		</Card>
	);
}
