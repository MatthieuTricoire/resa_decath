import { createFileRoute } from "@tanstack/react-router";
import { StoreHoursForm } from "#/features/store-hours/store-hours-form";
import { getStoreHours } from "#/features/store-hours/queries";
import { storeHoursKeys } from "#/features/store-hours/query-keys";

export const Route = createFileRoute("/admin/_layout/reglages/horaires")({
	loader: async ({ context: { queryClient } }) => {
		return await queryClient.fetchQuery({
			queryKey: storeHoursKeys.all,
			queryFn: () => getStoreHours(),
		});
	},
	component: RouteComponent,
});

function RouteComponent() {
	const hours = Route.useLoaderData();
	
	return (
		<div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 px-4 py-6 md:gap-10 md:py-8 lg:px-6">
			<div>
				<h2 className="text-lg font-semibold">Horaires d'ouverture</h2>
				<p className="text-sm text-muted-foreground">
					Définissez les plages horaires d'ouverture du magasin.
				</p>
			</div>
			<StoreHoursForm hours={hours} />
		</div>
	);
}