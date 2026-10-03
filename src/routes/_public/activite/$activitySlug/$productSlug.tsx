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

/** Fiche produit : variantes, prix par durée et ajout au panier. */
export const Route = createFileRoute(
	"/_public/activite/$activitySlug/$productSlug",
)({
	loader: async ({ context: { queryClient }, params }) => {
		const product = await queryClient.ensureQueryData({
			queryKey: ["public", "product", params.productSlug],
			queryFn: () => getPublicProductInSeason({ data: params.productSlug }),
		});
		if (!product) throw notFound();
		// L'URL doit correspondre à la catégorie réelle du matériel.
		if (product.activitySlug !== params.activitySlug) throw notFound();
		const activity = await queryClient.ensureQueryData({
			queryKey: ["public", "activity", params.activitySlug],
			queryFn: () => getPublicActivity({ data: params.activitySlug }),
		});
		return { product, activity };
	},
	headers: () => ({ "Cache-Control": PUBLIC_PAGE_CACHE_CONTROL }),
	head: ({ loaderData, params }) => {
		const product = loaderData?.product;
		if (!product) {
			return buildPageHead({
				meta: {
					title: "Produit introuvable",
					description: "Ce matériel n'est plus disponible à la location.",
					canonicalPath: null,
					noIndex: true,
				},
			});
		}
		const activityName = loaderData?.activity?.name ?? "Location";
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
						name: activityName,
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
					category: activityName,
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
	const { product, activity } = Route.useLoaderData();
	const { activitySlug } = Route.useParams();
	const copy = getActivityCopy(activity?.slug ?? "", activity?.name ?? "");

	const selection = useProductSelection(product);
	const { selected, bookableQuote, notice } = selection;
	const purchase = useProductPurchase({
		product,
		activitySlug,
		activityName: activity?.name ?? "",
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
		<div className="page-wrap pt-12 pb-32 md:pb-12">
			<Button
				asChild
				variant="ghost"
				size="sm"
				className="mb-6 -ml-3 h-10 sm:h-8"
			>
				<Link to="/activite/$activitySlug" params={{ activitySlug }}>
					<ArrowLeft className="size-4" aria-hidden="true" />
					{copy.lead ? (activity?.name ?? "Retour") : "Retour"}
				</Link>
			</Button>

			<div className="grid gap-10 lg:grid-cols-2">
				<ProductGallery
					name={product.name}
					image={product.image}
					description={product.description}
				/>

				<div className="space-y-6">
					<div>
						<p className="island-kicker">{product.brand}</p>
						<h1 className="display-title text-4xl font-semibold">
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

								{/* Ligne d'achat desktop : la barre sticky la remplace sur mobile. */}
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
