import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CartPersistenceProvider } from "#/components/public/cart-persistence";
import { PublicFooter } from "#/components/public/public-footer";
import { PublicHeader } from "#/components/public/public-header";
import {
	getPublicActivities,
	getPublicSeasonNotice,
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
		// Idem pour le bandeau d'inter-saison, sinon il apparaît en différé.
		await queryClient.prefetchQuery({
			queryKey: ["public", "season-notice"],
			queryFn: () => getPublicSeasonNotice(),
		});
	},
	component: PublicLayout,
});

/**
 * En inter-saison, le catalogue est vide : le visiteur doit comprendre que ce
 * n'est pas une panne et savoir quand ça rouvre.
 */
function PublicSeasonNotice() {
	const { data } = useQuery({
		queryKey: ["public", "season-notice"],
		queryFn: () => getPublicSeasonNotice(),
	});

	if (!data) return null;

	return (
		<output className="border-b border-amber-300/60 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
			<span className="font-medium">Locations en inter-saison.</span>{" "}
			{data.message}
		</output>
	);
}

function PublicLayout() {
	const { data: activities } = useQuery({
		queryKey: ["public", "activities"],
		queryFn: () => getPublicActivities(),
	});

	return (
		<CartPersistenceProvider>
			<div className="flex min-h-screen flex-col">
				<PublicHeader activities={activities?.activities ?? []} />
				<PublicSeasonNotice />
				<main className="flex-1">
					<Outlet />
				</main>
				<PublicFooter />
			</div>
		</CartPersistenceProvider>
	);
}
