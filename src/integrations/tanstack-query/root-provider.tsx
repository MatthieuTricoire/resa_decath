import { QueryClient } from "@tanstack/react-query";

export function getContext() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				// Les données servies par le SSR sont réutilisées un moment côté
				// client : sans `staleTime`, TanStack Query re-fetch tout dès
				// l'hydratation et double chaque appel API d'un serveur lent/loin.
				staleTime: 60_000,
			},
		},
	});

	return {
		queryClient,
	};
}
export default function TanstackQueryProvider() {}
