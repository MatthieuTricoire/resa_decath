import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	notFound,
	Outlet,
	useParams,
} from "@tanstack/react-router";
import {
	AlertTriangleIcon,
	ArrowLeft,
	ArrowRight,
	CalendarDays,
	CircleAlert,
} from "lucide-react";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { getActivityCopy } from "#/config/activities";
import { store, storeCanonicalPath } from "#/config/store";
import {
	getPublicActivity,
	getPublicActivityProducts,
	type PublicProductSummary,
} from "#/features/equipements/public-queries";
import {
	priceForDuration,
	supportsDuration,
} from "#/features/reservations/pricing";
import { PUBLIC_PAGE_CACHE_CONTROL } from "#/lib/cache-control";
import { rentalDurationLabel } from "#/lib/dates";
import { breadcrumbJsonLd, buildPageHead, itemListJsonLd } from "#/lib/seo";
import { cn } from "#/lib/utils";
import { cartDurationDays, usePublicCart } from "#/stores/public-cart.store";

/** Page d'activité : liste des produits réservables d'une catégorie. */
export const Route = createFileRoute("/_public/activite/$activitySlug")({
	loader: async ({ context: { queryClient }, params: { activitySlug } }) => {
		const activity = await queryClient.ensureQueryData({
			queryKey: ["public", "activity", activitySlug],
			queryFn: () => getPublicActivity({ data: activitySlug }),
		});
		if (!activity) throw notFound();
		// Le `head` a besoin de la liste pour générer le JSON-LD `ItemList`,
		// et la page pour les cartes : une seule lecture, partagée.
		const products = await queryClient.ensureQueryData({
			queryKey: ["public", "activity", activitySlug, "products"],
			queryFn: () => getPublicActivityProducts({ data: activitySlug }),
		});
		return { activity, products };
	},
	headers: () => ({ "Cache-Control": PUBLIC_PAGE_CACHE_CONTROL }),
	head: ({ loaderData, matches }) => {
		if (!loaderData?.activity) {
			return buildPageHead({
				meta: {
					title: "Activité introuvable",
					description: "Cette activité n'existe pas ou n'est plus disponible.",
					canonicalPath: null,
					noIndex: true,
				},
			});
		}
		const activity = loaderData.activity;
		const copy = getActivityCopy(activity.slug, activity.name);
		const products = loaderData.products ?? [];
		return buildPageHead({
			// La fiche produit émet son propre canonical : on ne l'émet ici que
			// si cette route est la plus profonde du match.
			emitCanonical:
				matches.at(-1)?.routeId === "/_public/activite/$activitySlug",
			meta: {
				title: copy.title,
				description: copy.body,
				canonicalPath: `/activite/${activity.slug}`,
				noIndex: false,
			},
			jsonLd: [
				breadcrumbJsonLd([
					{ name: store.name, path: storeCanonicalPath },
					{ name: activity.name, path: `/activite/${activity.slug}` },
				]),
				itemListJsonLd(
					activity.name,
					`/activite/${activity.slug}`,
					products.map((product) => ({
						name: product.name,
						path: `/activite/${activity.slug}/${product.slug}`,
					})),
				),
			],
		});
	},
	component: ActivityPage,
});

function ActivityPage() {
	const { activitySlug } = Route.useParams();
	const { activity } = Route.useLoaderData();
	const products = useQuery({
		queryKey: ["public", "activity", activitySlug, "products"],
		queryFn: () => getPublicActivityProducts({ data: activitySlug }),
	});
	const durationDays = usePublicCart(cartDurationDays);
	const copy = getActivityCopy(activity.slug, activity.name);
	// La fiche produit est une route enfant : sans cet Outlet, `/activite/x/y`
	// n'afficherait que la liste des produits.
	const { productSlug } = useParams({ strict: false });
	if (productSlug) return <Outlet />;

	// Le catalogue est filtré sur la durée choisie : autant le dire, plutôt que
	// de laisser le client découvrir le refus au panier.
	const catalog = products.data ?? [];
	const availableCount =
		durationDays > 0
			? catalog.filter((product) => supportsDuration(product, durationDays))
					.length
			: catalog.length;

	return (
		<div className="page-wrap py-12">
			<Button
				asChild
				variant="ghost"
				size="sm"
				className="mb-6 -ml-3 h-10 sm:h-8"
			>
				<Link to={storeCanonicalPath}>
					<ArrowLeft className="size-4" aria-hidden="true" />
					Toutes les activités
				</Link>
			</Button>

			<header className="rise-in max-w-3xl space-y-3">
				<p className="island-kicker">Location {activity.name.toLowerCase()}</p>
				<h1 className="display-title text-4xl font-semibold">{copy.title}</h1>
				<p className="text-lg text-[var(--sea-ink-soft)]">{copy.lead}</p>
				<p className="text-sm text-[var(--sea-ink-soft)]">{copy.body}</p>
			</header>

			{durationDays > 0 ? (
				<p className="mt-10 flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
					<CalendarDays className="size-4 shrink-0" aria-hidden="true" />
					{availableCount} article{availableCount > 1 ? "s" : ""} sur{" "}
					{catalog.length} disponible{availableCount > 1 ? "s" : ""} pour{" "}
					{rentalDurationLabel(durationDays).toLowerCase()}.
				</p>
			) : (
				<Alert className="mt-10 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
					<AlertTriangleIcon aria-hidden="true" />
					<AlertTitle>Choisissez vos dates</AlertTitle>
					<AlertDescription className="text-amber-900 dark:text-amber-50">
						pour voir les tarifs par durée.
					</AlertDescription>
					<AlertAction>
						<Button
							asChild
							size="sm"
							className="h-10 w-full bg-amber-600 text-amber-50 hover:bg-amber-700 sm:h-8 sm:w-auto dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-amber-950"
						>
							<Link to={storeCanonicalPath} hash="etape-1">
								Choisir mes dates
							</Link>
						</Button>
					</AlertAction>
				</Alert>
			)}

			<div className="mt-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
				{catalog.map((product) => (
					<ProductCard
						key={product.slug}
						product={product}
						activitySlug={activitySlug}
						durationDays={durationDays}
					/>
				))}
			</div>
		</div>
	);
}

function ProductCard({
	product,
	activitySlug,
	durationDays,
}: {
	product: PublicProductSummary;
	activitySlug: string;
	/** Durée choisie dans le sélecteur global, `0` si aucune. */
	durationDays: number;
}) {
	// Grisé mais cliquable : la fiche explique pourquoi rien n'est réservable,
	// alors qu'une carte morte ferait croire à un site cassé. Un produit sans
	// aucun tarif n'est pas grisé : ce n'est pas la durée choisie le problème.
	const coversDuration = supportsDuration(product, durationDays);
	const muted = durationDays > 0 && !coversDuration;
	const price =
		durationDays > 0 ? priceForDuration(product, durationDays) : null;

	return (
		<Link
			to="/activite/$activitySlug/$productSlug"
			params={{ activitySlug, productSlug: product.slug }}
			className={cn(
				"feature-card rise-in flex flex-col overflow-hidden rounded-2xl border border-[var(--line)] no-underline",
				muted && "opacity-70 grayscale",
			)}
		>
			<div className="aspect-[4/3] w-full overflow-hidden bg-[var(--sand)]">
				{product.image ? (
					<img
						src={product.image.url}
						alt={product.image.alt ?? product.name}
						loading="lazy"
						decoding="async"
						className="size-full object-cover"
					/>
				) : (
					<div className="grid size-full place-items-center text-sm text-[var(--sea-ink-soft)]">
						Image à venir
					</div>
				)}
			</div>
			<div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
				<p className="island-kicker">{product.brand}</p>
				<h2 className="font-semibold">{product.name}</h2>
				{muted ? (
					<p className="flex items-center gap-1.5 text-sm text-[var(--sea-ink-soft)]">
						<CircleAlert className="size-4 shrink-0" aria-hidden="true" />
						{product.bookable
							? `Aucun tarif sur ${rentalDurationLabel(durationDays).toLowerCase()}`
							: "Non réservable en ligne"}
					</p>
				) : null}
				<div className="mt-auto flex flex-col gap-1 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
					<span className="text-sm text-[var(--sea-ink-soft)]">
						{price !== null ? (
							<>
								<strong className="text-base text-[var(--sea-ink)]">
									{price.toFixed(2)} €
								</strong>{" "}
								pour {rentalDurationLabel(durationDays).toLowerCase()}
							</>
						) : product.priceFrom ? (
							<>
								dès{" "}
								<strong className="text-base text-[var(--sea-ink)]">
									{Number(product.priceFrom).toFixed(2)} €
								</strong>
							</>
						) : (
							"Prix sur demande"
						)}
					</span>
					<ArrowRight
						className="size-4 self-end sm:self-auto"
						aria-hidden="true"
					/>
				</div>
			</div>
		</Link>
	);
}
