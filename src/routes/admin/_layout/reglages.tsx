import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "#/components/site-header";
import { BillingSettingsForm } from "#/features/billing/billing-settings-form";
import { getBillingSettings } from "#/features/billing/queries";
import { queryKeys as billingQueryKeys } from "#/features/billing/query-keys";
import { getRentalDurations } from "#/features/durees/queries";
import { queryKeys as durationQueryKeys } from "#/features/durees/query-keys";
import { RentalDurationsForm } from "#/features/durees/rental-durations-form";
import { getRentalSettings } from "#/features/settings/queries";
import { queryKeys as settingsQueryKeys } from "#/features/settings/query-keys";
import { RentalSettingsForm } from "#/features/settings/rental-settings-form";
import { Route as AdminLayoutRoute } from "../_layout";

export const Route = createFileRoute("/admin/_layout/reglages")({
	loader: async ({ context: { queryClient } }) => {
		const [settings] = await Promise.all([
			queryClient.fetchQuery({
				queryKey: settingsQueryKeys.settings.all,
				queryFn: () => getRentalSettings(),
			}),
			queryClient.prefetchQuery({
				queryKey: durationQueryKeys.durees.all,
				queryFn: () => getRentalDurations(),
			}),
			queryClient.prefetchQuery({
				queryKey: billingQueryKeys.billing.settings,
				queryFn: () => getBillingSettings(),
			}),
		]);
		return { settings };
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { settings } = Route.useLoaderData();
	const { user } = AdminLayoutRoute.useLoaderData();
	const isAdmin = user.role === "admin";

	return (
		<>
			<SiteHeader title="Réglages" />
			<main className="@container/main flex min-w-0 flex-1 flex-col gap-2">
				<div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 px-4 py-6 md:gap-10 md:py-8 lg:px-6">
					<div>
						<h2 className="text-lg font-semibold">
							Paramètres de l’application
						</h2>
						<p className="text-sm text-muted-foreground">
							Centralisez les règles de location, les durées et la tarification
							de la plateforme.
						</p>
					</div>

					<RentalSettingsForm settings={settings} />

					<section id="durees" className="scroll-mt-6">
						<RentalDurationsForm />
					</section>

					<section
						id="tarification"
						className="flex scroll-mt-6 flex-col gap-4"
					>
						<div>
							<h2 className="text-lg font-semibold">Tarification</h2>
							<p className="text-sm text-muted-foreground">
								Paramètres financiers utilisés pour calculer la facturation.
							</p>
						</div>
						<BillingSettingsForm isAdmin={isAdmin} />
					</section>
				</div>
			</main>
		</>
	);
}
