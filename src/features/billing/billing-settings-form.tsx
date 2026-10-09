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
	const [commissionRateWeb, setCommissionRateWeb] = useState("");
	const [commissionRateStore, setCommissionRateStore] = useState("");

	useEffect(() => {
		if (!settings) return;
		setMonthlyFee(String(settings.monthlyFee));
		setCommissionRateWeb(String(settings.commissionRateWeb));
		setCommissionRateStore(String(settings.commissionRateStore));
	}, [settings]);

	const saveMutation = useMutation({
		mutationFn: (input: {
			monthlyFee: number;
			commissionRateWeb: number;
			commissionRateStore: number;
		}) => updateBillingSettings({ data: input }),
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
		const parsedCommissionRateWeb = Number.parseFloat(commissionRateWeb);
		const parsedCommissionRateStore = Number.parseFloat(commissionRateStore);
		if (Number.isNaN(parsedMonthlyFee) || parsedMonthlyFee < 0) {
			toast.error("Forfait mensuel invalide.");
			return;
		}
		if (
			Number.isNaN(parsedCommissionRateWeb) ||
			parsedCommissionRateWeb < 0 ||
			parsedCommissionRateWeb > 100
		) {
			toast.error("La commission web doit être comprise entre 0 et 100 %.");
			return;
		}
		if (
			Number.isNaN(parsedCommissionRateStore) ||
			parsedCommissionRateStore < 0 ||
			parsedCommissionRateStore > 100
		) {
			toast.error("La commission magasin doit être comprise entre 0 et 100 %.");
			return;
		}
		saveMutation.mutate({
			monthlyFee: parsedMonthlyFee,
			commissionRateWeb: parsedCommissionRateWeb,
			commissionRateStore: parsedCommissionRateStore,
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
							<InputGroup className="w-full sm:w-36">
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
						<FieldLabel>Commission Web</FieldLabel>
						<FieldContent>
							<InputGroup className="w-full sm:w-32">
								<InputGroupInput
									type="number"
									min={0}
									max={100}
									step="0.01"
									inputMode="decimal"
									value={commissionRateWeb}
									disabled={!isAdmin}
									onChange={(event) => setCommissionRateWeb(event.target.value)}
								/>
								<InputGroupAddon align="inline-end">%</InputGroupAddon>
							</InputGroup>
						</FieldContent>
					</Field>
					<Field
						orientation="horizontal"
						className="items-start sm:items-center"
					>
						<FieldLabel>Commission Magasin</FieldLabel>
						<FieldContent>
							<InputGroup className="w-full sm:w-32">
								<InputGroupInput
									type="number"
									min={0}
									max={100}
									step="0.01"
									inputMode="decimal"
									value={commissionRateStore}
									disabled={!isAdmin}
									onChange={(event) =>
										setCommissionRateStore(event.target.value)
									}
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
