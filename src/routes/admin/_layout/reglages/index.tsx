import { createFileRoute } from "@tanstack/react-router";
import { getRentalDurations } from "#/features/durees/queries";
import { queryKeys as durationQueryKeys } from "#/features/durees/query-keys";
import { RentalDurationsForm } from "#/features/durees/rental-durations-form";
import { getRentalSettings } from "#/features/settings/queries";
import { queryKeys as settingsQueryKeys } from "#/features/settings/query-keys";
import { RentalSettingsForm } from "#/features/settings/rental-settings-form";

export const Route = createFileRoute("/admin/_layout/reglages/")({
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
		]);
		return { settings };
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { settings } = Route.useLoaderData();

	return (
		<div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 px-4 py-6 md:gap-10 md:py-8 lg:px-6">
			<div>
				<h2 className="text-lg font-semibold">Paramètres de location</h2>
				<p className="text-sm text-muted-foreground">
					Disponibilités et durées de location.
				</p>
			</div>
			<RentalSettingsForm settings={settings} />
			<section className="scroll-mt-6">
				<RentalDurationsForm />
			</section>
		</div>
	);
}
