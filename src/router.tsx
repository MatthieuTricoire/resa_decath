import "./env";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const context = getContext();

	const router = createTanStackRouter({
		routeTree,
		context,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
	});

	// Pont serveur → client du cache de requêtes (déshydratation/hydratation SSR).
	// Sans lui, le client hydrate avec un cache vide au chargement direct et rend
	// un état différent du HTML serveur (ex. bannière « Retards à gérer » du
	// dashboard) : c'est la cause du « Hydration failed ».
	// `wrapQueryClient: false` : le QueryClientProvider est déjà fourni par
	// `__root.tsx` (RootComponent), inutile d'en ajouter un au niveau du Wrap.
	setupRouterSsrQueryIntegration({
		router,
		queryClient: context.queryClient,
		wrapQueryClient: false,
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
