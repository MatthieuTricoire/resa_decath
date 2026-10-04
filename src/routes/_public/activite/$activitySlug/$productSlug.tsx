import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { derivePriceSummary } from "#/components/public/product/derive-purchase";
import { PriceSummary } from "#/components/public/product/price-summary";
import { ProductDatesSection } from "#/components/public/product/product-dates-section";
import { ProductGallery } from "#/components/public/product/product-gallery";
import { ProductNotice } from "#/components/public/product/product-notice";
import { ProductPurchaseBar } from "#/components/public/product/product-purchase-bar";
import { useProductPurchase } from "#/components/public/product/use-product-purchase";
import { useProductSelection } from "#/components/public/product/use-product-selection";
import { useSwitchDuration } from "#/components/public/product/use-switch-duration";
import { VariantPicker } from "#/components/public/product/variant-picker";
import { MobileStickyBar } from "#/components/public/shared/mobile-sticky-bar";
import { StockBadge } from "#/components/public/shared/stock-badge";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { getActivityCopy } from "#/config/activities";
import { store, storeCanonicalPath } from "#/config/store";
import {
	getPublicActivity,
	getPublicProductInSeason,
} from "#/features/equipements/public-queries";
import { PUBLIC_PAGE_CACHE_CONTROL } from "#/lib/cache-control";
import { breadcrumbJsonLd, buildPageHead, productJsonLd } from "#/lib/seo";

export const Route = createFileRoute(
	"/_public/activite/$activitySlug/$productSlug",
)({
	loader: async ({ context: { queryClient }, params }) => {
		// fetchQuery et non ensureQueryData : on attend des données fraîches à
		// chaque navigation. Le stock bouge quand un autre utilisateur réserve,
		// et le useSuspenseQuery du composant est figé (`staleTime: "static"`),
		// donc le loader est le seul point de rafraîchissement.
		const [product, activity] = await Promise.all([
			queryClient.fetchQuery({
				queryKey: ["public", "product", params.productSlug],
				queryFn: () => getPublicProductInSeason({ data: params.productSlug }),
			}),
			queryClient.fetchQuery({
				queryKey: ["public", "activity", params.activitySlug],
				queryFn: () => getPublicActivity({ data: params.activitySlug }),
			}),
		]);

		// Sécurité stricte : si l'un des deux manque, ou si la catégorie ne correspond pas -> 404
		if (!product || !activity || product.activitySlug !== params.activitySlug) {
			throw notFound();
		}

		return { product, activity };
	},
	headers: () => ({ "Cache-Control": PUBLIC_PAGE_CACHE_CONTROL }),
	head: ({ loaderData, params }) => {
		const product = loaderData?.product;
		const activity = loaderData?.activity;

		if (!product || !activity) {
			return buildPageHead({
				meta: {
					title: "Produit introuvable",
					description: "Ce matériel n'est plus disponible à la location.",
					canonicalPath: null,
					noIndex: true,
				},
			});
		}

		return buildPageHead({
			meta: {
				title: `${product.name} à ${store.city}`,
				description:
					product.description ??
					`${product.name} ${product.brand} à la location à ${store.name} ${store.city}. Retrait ${store.pickupWindow}, retour ${store.returnWindow}.`,
				canonicalPath: `/activite/${params.activitySlug}/${product.slug}`,
				noIndex: false,
				image: product.image?.url ?? null,
				type: "product",
			},
			jsonLd: [
				breadcrumbJsonLd([
					{ name: store.name, path: storeCanonicalPath },
					{
						name: activity.name,
						path: `/activite/${params.activitySlug}`,
					},
					{
						name: product.name,
						path: `/activite/${params.activitySlug}/${product.slug}`,
					},
				]),
				productJsonLd({
					name: product.name,
					path: `/activite/${params.activitySlug}/${product.slug}`,
					category: activity.name,
					description: product.description ?? null,
					brand: product.brand,
					image: product.image?.url ?? null,
					priceFrom: product.priceFrom,
					bookable: product.bookable,
				}),
			],
		});
	},
	component: ProductPage,
});

function ProductPage() {
	const { activitySlug, productSlug } = Route.useParams();
	const loaderData = Route.useLoaderData();

	// Remplacement de useLoaderData par useSuspenseQuery pour le typage strict
	// et la mise à jour des stocks en arrière-plan sans rechargement.
	const { data: queryProduct } = useSuspenseQuery({
		queryKey: ["public", "product", productSlug],
		queryFn: () => getPublicProductInSeason({ data: productSlug }),
		initialData: loaderData.product,
		staleTime: "static",
	});
	const { data: queryActivity } = useSuspenseQuery({
		queryKey: ["public", "activity", activitySlug],
		queryFn: () => getPublicActivity({ data: activitySlug }),
		initialData: loaderData.activity,
		staleTime: "static",
	});

	const product = queryProduct ?? loaderData.product;
	const activity = queryActivity ?? loaderData.activity;

	const copy = getActivityCopy(activity.slug, activity.name);

	const selection = useProductSelection(product);
	const { selected, bookableQuote, notice } = selection;
	const purchase = useProductPurchase({
		product: product,
		activitySlug,
		activityName: activity.name,
		selected,
		selectedQuote: selection.selectedQuote,
		bookableQuote,
		hasWindow: selection.hasWindow,
		durationNotPriced: selection.durationNotPriced,
		allSoldOut: selection.allSoldOut,
	});

	const switchDuration = useSwitchDuration(product.durations);
	const priceSummary = derivePriceSummary(selected, bookableQuote);

	const purchaseBarProps = {
		quantity: purchase.quantity,
		quantityMax: purchase.quantityMax,
		onQuantityChange: purchase.setQuantity,
		label: purchase.cta.label,
		icon: purchase.cta.icon,
		disabled: purchase.cta.disabled,
		busy: selection.isFetching,
		onClick: purchase.onBuyClick,
	};

	return (
		<div className="container mx-auto px-4 sm:px-6 pt-12 pb-32 md:pb-12">
			<Button
				asChild
				variant="ghost"
				size="sm"
				className="mb-6 -ml-3 h-10 sm:h-8"
			>
				<Link to="/activite/$activitySlug" params={{ activitySlug }}>
					<ArrowLeft className="mr-2 size-4" aria-hidden="true" />
					{copy.lead ? activity.name : "Retour"}
				</Link>
			</Button>

			<div className="grid gap-10 lg:grid-cols-2">
				<ProductGallery
					name={product.name}
					image={product.image}
					description={product.description}
				/>

				<div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
					<div>
						<p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
							{product.brand}
						</p>
						<h1 className="text-4xl font-semibold tracking-tight text-foreground mt-1">
							{product.name}
						</h1>
					</div>

					{notice.kind === "not_bookable" ? (
						<ProductNotice
							notice={notice}
							activitySlug={activitySlug}
							currentDuration={selection.durationDays}
							durations={product.durations}
							priceByDuration={product.priceByDuration}
							onPickDuration={switchDuration}
						/>
					) : (
						<>
							{selection.variantOptions.length > 1 && (
								<VariantPicker
									options={selection.variantOptions}
									selectedId={selection.selectedId}
									onSelect={selection.chooseVariant}
								/>
							)}

							<Separator />

							<div className="space-y-6">
								<ProductNotice
									notice={notice}
									activitySlug={activitySlug}
									currentDuration={selection.durationDays}
									durations={product.durations}
									priceByDuration={product.priceByDuration}
									onPickDuration={switchDuration}
								/>

								{priceSummary ? <PriceSummary data={priceSummary} /> : null}

								<ProductDatesSection
									minDuration={product.minDuration}
									durationSupport={selection.durationSupport}
								/>

								<div className="hidden md:block">
									<ProductPurchaseBar {...purchaseBarProps} />
								</div>
								{purchase.stockLine ? (
									<StockBadge tone={purchase.stockLine.tone}>
										{purchase.stockLine.label}
									</StockBadge>
								) : null}
							</div>
						</>
					)}
				</div>

				{notice.kind !== "not_bookable" && (
					<MobileStickyBar>
						<ProductPurchaseBar {...purchaseBarProps} compact />
					</MobileStickyBar>
				)}
			</div>
		</div>
	);
}
