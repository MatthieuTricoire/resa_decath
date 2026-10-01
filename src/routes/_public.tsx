import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CartPersistenceProvider } from "#/components/public/cart-persistence";
import { PublicFooter } from "#/components/public/public-footer";
import { PublicHeader } from "#/components/public/public-header";
import {
	getPublicActivities,
	getPublicStoreSchedule,
} from "#/features/equipements/public-queries";

/**
 * Layout public : en-tête et pied communs à toutes les pages client.
 * Les routes admin restent en dehors de ce layout.
 */
export const Route = createFileRoute("/_public")({
	loader: async ({ context: { queryClient } }) => {
		await queryClient.prefetchQuery({
			queryKey: ["public", "activities"],
			queryFn: () => getPublicActivities(),
		});
		// Le pied de page et la page ville affichent les horaires : les charger avec le
		// layout évite qu'ils affichent la semaine de référence le temps de
		// l'hydratation.
		await queryClient.prefetchQuery({
			queryKey: ["public", "store-schedule"],
			queryFn: () => getPublicStoreSchedule(),
		});
	},
	component: PublicLayout,
});

function PublicLayout() {
	const { data: activities } = useQuery({
		queryKey: ["public", "activities"],
		queryFn: () => getPublicActivities(),
	});

	return (
		<CartPersistenceProvider>
			<div className="flex min-h-screen flex-col">
				<PublicHeader activities={activities?.activities ?? []} />
				<main className="flex-1">
					<Outlet />
				</main>
				<PublicFooter />
			</div>
		</CartPersistenceProvider>
	);
}
