import { createFileRoute } from "@tanstack/react-router";
import { BillingSettingsForm } from "#/features/billing/billing-settings-form";
import { getBillingSettings } from "#/features/billing/queries";
import { queryKeys as billingQueryKeys } from "#/features/billing/query-keys";
import { Route as AdminLayoutRoute } from "../../_layout";

export const Route = createFileRoute("/admin/_layout/reglages/facturation")({
	loader: async ({ context: { queryClient } }) => {
		await queryClient.prefetchQuery({
			queryKey: billingQueryKeys.billing.settings,
			queryFn: () => getBillingSettings(),
		});
		return {};
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { user } = AdminLayoutRoute.useLoaderData();
	const isAdmin = user.role === "admin";

	return (
		<div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 px-4 py-6 md:gap-10 md:py-8 lg:px-6">
			<div>
				<h2 className="text-lg font-semibold">Paramètres de facturation</h2>
				<p className="text-sm text-muted-foreground">
					Tarification, taxes et règles financières.
				</p>
			</div>
			<BillingSettingsForm isAdmin={isAdmin} />
		</div>
	);
}
