import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Toaster } from "sonner";
import { Button } from "#/components/ui/button";
import { store, storeCanonicalPath } from "#/config/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				name: "theme-color",
				content: "#1f2937",
			},
			{
				title: store.defaultTitle,
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			// Icônes : favicon classique + tuile des écrans d'accueil iOS.
			{
				rel: "icon",
				href: "/favicon.ico",
			},
			{
				rel: "apple-touch-icon",
				href: "/logo512.png",
			},
			{
				rel: "manifest",
				href: "/manifest.json",
			},
		],
	}),
	notFoundComponent: RootNotFound,
	shellComponent: RootDocument,
});

/** Page 404 : aucune ville/activité/produit ne correspond à l'URL demandée. */
function RootNotFound() {
	return (
		<div className="page-wrap flex min-h-screen flex-col items-center justify-center gap-6 py-20 text-center">
			<p className="island-kicker">Erreur 404</p>
			<h1 className="display-title text-3xl font-semibold sm:text-4xl">
				Cette page n’existe pas
			</h1>
			<p className="max-w-md text-[var(--sea-ink-soft)]">
				Le matériel que vous cherchez n’est plus à cette adresse. Revenez à la
				boutique pour parcourir le catalogue de {store.name} {store.city}.
			</p>
			<Button asChild size="lg">
				<Link to={storeCanonicalPath}>Retour à la boutique</Link>
			</Button>
		</div>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="fr">
			<head>
				<HeadContent />
			</head>
			<body>
				<TooltipProvider>{children}</TooltipProvider>
				<Toaster position="top-center" richColors />
				{/* Le plugin devtools-vite retire ce bloc des builds de production. */}
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
