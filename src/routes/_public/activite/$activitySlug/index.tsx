import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarDays, CircleAlert } from "lucide-react";
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
import {
	cartDurationDays,
	formatPrice,
	usePublicCart,
} from "#/stores/public-cart.store";

export const Route = createFileRoute("/_public/activite/$activitySlug/")({
	loader: async ({ context: { queryClient }, params: { activitySlug } }) => {
		// 1. OPTIMISATION : Parallélisation des requêtes !
		const [activity, products] = await Promise.all([
			queryClient.ensureQueryData({
				queryKey: ["public", "activity", activitySlug],
				queryFn: () => getPublicActivity({ data: activitySlug }),
			}),
			queryClient.ensureQueryData({
				queryKey: ["public", "activity", activitySlug, "products"],
				queryFn: () => getPublicActivityProducts({ data: activitySlug }),
			}),
		]);

		if (!activity) throw notFound();

		return { activity, products };
	},
	headers: () => ({ "Cache-Control": PUBLIC_PAGE_CACHE_CONTROL }),
	head: ({ loaderData }) => {
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

		const { activity, products } = loaderData;
		const copy = getActivityCopy(activity.slug, activity.name);

		return buildPageHead({
			emitCanonical: true,
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
	component: ActivityPageIndex,
});

function ActivityPageIndex() {
	const { activitySlug } = Route.useParams();
	const { activity } = Route.useLoaderData();

	// 2. OPTIMISATION : Typage strict garanti
	const { data: catalog } = useSuspenseQuery({
		queryKey: ["public", "activity", activitySlug, "products"],
		queryFn: () => getPublicActivityProducts({ data: activitySlug }),
	});

	const durationDays = usePublicCart(cartDurationDays);
	const copy = getActivityCopy(activity.slug, activity.name);

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
					<ArrowLeft className="size-4 mr-2" aria-hidden="true" />
					Toutes les activités
				</Link>
			</Button>

			{/* 3. OPTIMISATION UI : Remplacement des couleurs dures par le thème Tailwind */}
			<header className="rise-in max-w-3xl space-y-3">
				<p className="island-kicker text-primary">
					Location {activity.name.toLowerCase()}
				</p>
				<h1 className="display-title text-4xl font-semibold text-foreground">
					{copy.title}
				</h1>
				<p className="text-lg text-muted-foreground">{copy.lead}</p>
				<p className="text-sm text-muted-foreground">{copy.body}</p>
			</header>

			{durationDays > 0 && (
				<p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
					<CalendarDays className="size-4 shrink-0" aria-hidden="true" />
					{availableCount === 0 ? (
						<span>Aucun matériel disponible pour cette durée</span>
					) : (
						<span>
							<strong className="text-foreground">{availableCount}</strong> sur{" "}
							{catalog.length} équipement
							{catalog.length > 1 ? "s" : ""} disponible
							{availableCount > 1 ? "s" : ""} pour{" "}
							{rentalDurationLabel(durationDays).toLowerCase()}
						</span>
					)}
				</p>
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
	durationDays: number;
}) {
	const coversDuration = supportsDuration(product, durationDays);
	const muted = durationDays > 0 && !coversDuration;
	const price =
		durationDays > 0 ? priceForDuration(product, durationDays) : null;

	return (
		<Link
			to="/activite/$activitySlug/$productSlug"
			params={{ activitySlug, productSlug: product.slug }}
			className={cn(
				"feature-card rise-in flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground no-underline transition-colors hover:border-primary/50",
				muted && "opacity-70 grayscale",
			)}
		>
			<div className="aspect-[4/3] w-full overflow-hidden bg-muted">
				{product.image ? (
					<img
						src={product.image.url}
						alt={product.image.alt ?? product.name}
						loading="lazy"
						decoding="async"
						className="size-full object-cover transition-transform duration-300 hover:scale-105"
					/>
				) : (
					<div className="grid size-full place-items-center text-sm text-muted-foreground">
						Image à venir
					</div>
				)}
			</div>
			<div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
				<p className="island-kicker text-muted-foreground">{product.brand}</p>
				<h2 className="font-semibold">{product.name}</h2>
				{muted ? (
					<p className="flex items-center gap-1.5 text-sm text-destructive">
						<CircleAlert className="size-4 shrink-0" aria-hidden="true" />
						{product.bookable
							? `Aucun tarif sur ${rentalDurationLabel(durationDays).toLowerCase()}`
							: "Non réservable en ligne"}
					</p>
				) : null}
				<div className="mt-auto flex flex-col gap-1 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
					<span className="text-sm text-muted-foreground">
						{price !== null ? (
							<>
								<strong className="text-base text-foreground">
									{formatPrice(price)}
								</strong>{" "}
								pour {rentalDurationLabel(durationDays).toLowerCase()}
							</>
						) : product.priceFrom ? (
							<>
								dès{" "}
								<strong className="text-base text-foreground">
									{formatPrice(Number(product.priceFrom))}
								</strong>
							</>
						) : (
							"Prix sur demande"
						)}
					</span>
					<ArrowRight
						className="size-4 self-end text-muted-foreground sm:self-auto"
						aria-hidden="true"
					/>
				</div>
			</div>
		</Link>
	);
}
