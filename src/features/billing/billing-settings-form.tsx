import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
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
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "#/components/ui/input-group";
import {
	getBillingSettings,
	updateBillingSettings,
} from "#/features/billing/queries";
import { queryKeys } from "#/features/billing/query-keys";

export function BillingSettingsForm({ isAdmin }: { isAdmin: boolean }) {
	const queryClient = useQueryClient();
	const { data: settings } = useQuery({
		queryKey: queryKeys.billing.settings,
		queryFn: () => getBillingSettings(),
	});
	const [monthlyFee, setMonthlyFee] = useState("");
	const [commissionRate, setCommissionRate] = useState("");

	useEffect(() => {
		if (!settings) return;
		setMonthlyFee(String(settings.monthlyFee));
		setCommissionRate(String(settings.commissionRate));
	}, [settings]);

	const saveMutation = useMutation({
		mutationFn: (input: { monthlyFee: number; commissionRate: number }) =>
			updateBillingSettings({ data: input }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.billing.settings });
			queryClient.invalidateQueries({ queryKey: queryKeys.billing.monthly });
			toast.success("Tarification enregistrée.");
		},
		onError: (error) =>
			toast.error(error instanceof Error ? error.message : "Erreur"),
	});

	const handleSave = () => {
		const parsedMonthlyFee = Number.parseFloat(monthlyFee);
		const parsedCommissionRate = Number.parseFloat(commissionRate);
		if (Number.isNaN(parsedMonthlyFee) || parsedMonthlyFee < 0) {
			toast.error("Forfait mensuel invalide.");
			return;
		}
		if (
			Number.isNaN(parsedCommissionRate) ||
			parsedCommissionRate < 0 ||
			parsedCommissionRate > 100
		) {
			toast.error("La commission doit être comprise entre 0 et 100 %.");
			return;
		}
		saveMutation.mutate({
			monthlyFee: parsedMonthlyFee,
			commissionRate: parsedCommissionRate,
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Tarification de la plateforme</CardTitle>
				<CardDescription>
					Ces paramètres s’appliquent rétroactivement au calcul de la
					facturation.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-6 md:flex-row md:items-end md:gap-8">
					<Field
						orientation="horizontal"
						className="items-start sm:items-center"
					>
						<FieldLabel>Forfait mensuel</FieldLabel>
						<FieldContent>
							<InputGroup className="w-full sm:w-40">
								<InputGroupInput
									type="number"
									min={0}
									step="0.01"
									inputMode="decimal"
									value={monthlyFee}
									disabled={!isAdmin}
									onChange={(event) => setMonthlyFee(event.target.value)}
								/>
								<InputGroupAddon align="inline-end">€</InputGroupAddon>
							</InputGroup>
						</FieldContent>
					</Field>
					<Field
						orientation="horizontal"
						className="items-start sm:items-center"
					>
						<FieldLabel>Commission</FieldLabel>
						<FieldContent>
							<InputGroup className="w-full sm:w-32">
								<InputGroupInput
									type="number"
									min={0}
									max={100}
									step="0.01"
									inputMode="decimal"
									value={commissionRate}
									disabled={!isAdmin}
									onChange={(event) => setCommissionRate(event.target.value)}
								/>
								<InputGroupAddon align="inline-end">%</InputGroupAddon>
							</InputGroup>
						</FieldContent>
					</Field>
					{isAdmin && (
						<Button
							type="button"
							onClick={handleSave}
							disabled={saveMutation.isPending}
							className="md:ml-auto"
						>
							<Save /> Enregistrer
						</Button>
					)}
				</div>
				{!isAdmin && (
					<p className="mt-4 text-sm text-muted-foreground">
						Seul un administrateur peut modifier la tarification de la
						plateforme.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
