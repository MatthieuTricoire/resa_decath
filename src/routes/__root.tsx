import { TanStackDevtools } from "@tanstack/react-devtools";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	type ErrorComponentProps,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
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
	component: RootComponent,
	errorComponent: RootError,
});

/** Enveloppe l'application avec le QueryClientProvider passé via le contexte du routeur. */
function RootComponent() {
	const { queryClient } = Route.useRouteContext();

	return (
		<QueryClientProvider client={queryClient}>
			<Outlet />
		</QueryClientProvider>
	);
}
/**
 * Composant d'erreur global (500)
 * Capture les erreurs non gérées dans les routes enfants.
 */
function RootError({ error, reset }: ErrorComponentProps) {
	return (
		<div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 px-4 py-20 text-center">
			<p className="text-sm font-semibold uppercase tracking-wider text-destructive">
				Erreur inattendue
			</p>
			<h1 className="text-3xl font-semibold sm:text-4xl text-foreground">
				Oups, un problème est survenu
			</h1>
			<p className="max-w-md text-muted-foreground">
				Nous n'avons pas pu charger cette page. Vous pouvez réessayer ou
				retourner à l'accueil de la boutique.
			</p>
			{import.meta.env.DEV && (
				<pre className="max-w-xl overflow-x-auto rounded-lg bg-muted px-4 py-3 text-left font-mono text-xs whitespace-pre-wrap text-destructive">
					{error instanceof Error ? error.message : String(error)}
				</pre>
			)}
			<div className="flex items-center gap-4">
				<Button variant="outline" onClick={reset}>
					Réessayer
				</Button>
				<Button asChild>
					<Link to={storeCanonicalPath}>Retour à la boutique</Link>
				</Button>
			</div>
		</div>
	);
}
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
						// Le panneau TanStack Router devtools n'est plus proposé : sa
						// dépendance (`router.stores.pendingMatches`) a disparu du
						// routeur 1.170 et aucune version publiée n'est compatible.
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
