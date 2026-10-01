import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { ArrowLeft, ShoppingBasket, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DurationConflictNotice } from "#/components/public/duration-conflict-notice";
import { RentalWindowSelector } from "#/components/public/rental-window-selector";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { getActivityCopy } from "#/config/activities";
import { store, storeCanonicalPath } from "#/config/store";
import {
	describeVariantAttributes,
	getPublicActivity,
	getPublicProductInSeason,
	getPublicStoreSchedule,
	getPublicWindowQuotes,
	type PublicVariant,
	type PublicWindowQuote,
} from "#/features/equipements/public-queries";
import { resolveDuration } from "#/features/reservations/opening-days";
import {
	type ProductDurationSupport,
	productDurationSupport,
	supportsDuration,
} from "#/features/reservations/pricing";
import { PUBLIC_PAGE_CACHE_CONTROL } from "#/lib/cache-control";
import {
	DEFAULT_LAST_SAME_DAY_PICKUP_HOUR,
	earliestPickupDateInParis,
	rentalDurationLabel,
} from "#/lib/dates";
import { breadcrumbJsonLd, buildPageHead, productJsonLd } from "#/lib/seo";
import { cn } from "#/lib/utils";
import {
	addPublicCartLine,
	cartDurationDays,
	cartItemCount,
	cartVariantQuantity,
	setPublicCartWindow,
	usePublicCart,
} from "#/stores/public-cart.store";

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
	const copy = getActivityCopy(activity?.slug ?? "", activity?.name ?? "");
	const router = useRouter();

	const bookableVariants = product.variants.filter(
		(variant) => variant.bookable,
	);
	const [variantId, setVariantId] = useState(bookableVariants[0]?.id ?? "");
	const [quantity, setQuantity] = useState(1);

	const activitySlug = Route.useParams().activitySlug;
	const pickupDate = usePublicCart((state) => state.pickupDate);
	const returnDate = usePublicCart((state) => state.returnDate);
	// Inclusive des deux dates, comme `getReservationDurationDays` côté serveur.
	const durationDays = usePublicCart(cartDurationDays);
	const hasWindow = durationDays > 0 && Boolean(pickupDate && returnDate);

	// Une variante qui ne couvre pas la durée choisie mènerait à une impasse :
	// on bascule sur celle qui la couvre, sinon le devis serveur le dira.
	const entries = bookableVariants.map((variant) => ({
		variant,
		support: variantSupport(variant, product.minDuration),
	}));
	// Clé de requête : la liste est triée pour que deux rendus successifs
	// produisent la même clé. TanStack la hache, l'identité du tableau n'entre
	// pas en compte.
	const bookableVariantIds = bookableVariants
		.map((variant) => variant.id)
		.sort();
	// Le serveur reste maître du prix : même logique que la réservation finale,
	// saison comprise, donc impossible d'annoncer un total que le refusera.
	const quote = useQuery({
		queryKey: [
			"public",
			"window-quotes",
			{ pickupDate, returnDate, variantIds: bookableVariantIds },
		],
		queryFn: () =>
			getPublicWindowQuotes({
				data: {
					pickupDate: pickupDate ?? "",
					returnDate: returnDate ?? "",
					variantIds: bookableVariantIds,
				},
			}),
		enabled: hasWindow && bookableVariantIds.length > 0,
		staleTime: 60 * 1000,
	});
	const quotesByVariant = useMemo(() => {
		const byVariant = new Map<string, PublicWindowQuote>();
		for (const line of quote.data ?? []) byVariant.set(line.variantId, line);
		return byVariant;
	}, [quote.data]);
	const selectedEntry =
		entries.find((entry) => entry.variant.id === variantId) ?? null;
	// Une variante retenue ne doit mener nulle part : si elle ne couvre pas la
	// durée ou qu'il ne reste plus d'exemplaire, on bascule sur celle qui reste
	// vendable. Tant que les devis ne sont pas arrivés, on ne peut rien dire du
	// stock : la sélection se fait sur la durée, puis leur arrivée la corrige.
	const quotesLoaded = hasWindow && (quote.data?.length ?? 0) > 0;
	const isUsable = (entry: {
		variant: PublicVariant;
		support: ProductDurationSupport;
	}): boolean => {
		if (hasWindow && !supportsDuration(entry.support, durationDays))
			return false;
		if (!quotesLoaded) return true;
		const entryQuote = quotesByVariant.get(entry.variant.id);
		return (
			entryQuote?.status === "available" && entryQuote.availableQuantity > 0
		);
	};
	const active =
		selectedEntry && isUsable(selectedEntry)
			? selectedEntry
			: (entries.find(isUsable) ?? null);
	const selected = active?.variant ?? null;

	// Aucune variante vendable pour cette fenêtre : on distingue le stock épuisé,
	// qui est un coup de feu, d'un matériel retiré ou hors saison, qui ne se
	// réglera pas en changeant de date.
	const coveringEntries = hasWindow
		? entries.filter((entry) => supportsDuration(entry.support, durationDays))
		: [];
	const allSoldOut =
		hasWindow &&
		quotesLoaded &&
		selected === null &&
		coveringEntries.length > 0 &&
		coveringEntries.every((entry) => {
			const entryQuote = quotesByVariant.get(entry.variant.id);
			return (
				entryQuote?.status === "available" && entryQuote.availableQuantity === 0
			);
		});
	const blockedMessage =
		!hasWindow || selected !== null
			? null
			: allSoldOut
				? "Tous les exemplaires sont réservés ou loués sur ces dates."
				: (coveringEntries
						.map((entry) => quotesByVariant.get(entry.variant.id)?.message)
						.find((message) => Boolean(message)) ??
					"Ce matériel n’est pas louable sur ces dates.");

	// Aucune variante ne couvre la fenêtre choisie : c'est la durée le problème,
	// pas le matériel. `durations` vient du serveur, déjà filtré par la durée
	// minimale de l'article, donc la liste proposée est toujours vendable.
	const durationNotPriced =
		hasWindow && product.bookable && !product.durations.includes(durationDays);
	const cartCount = usePublicCart(cartItemCount);

	// Jours d'ouverture : une durée proposée ici peut se terminer un jour de
	// fermeture, auquel cas on rabat sur la durée vendable la plus proche.
	const schedule = useQuery({
		queryKey: ["public", "store-schedule"],
		queryFn: () => getPublicStoreSchedule(),
		staleTime: 5 * 60 * 1000,
	});

	// La fenêtre est celle de toute la commande : on prévient avant de la
	// changer sous les pieds d'un panier déjà rempli.
	const switchDuration = (nextDuration: number) => {
		// Date la plus proche servie côté public : aujourd'hui avant la coupure,
		// sinon demain — jamais une fenêtre du jour même une fois celle-ci passée.
		const pickup =
			pickupDate ??
			earliestPickupDateInParis(
				schedule.data?.lastSameDayPickupHour ??
					DEFAULT_LAST_SAME_DAY_PICKUP_HOUR,
			);
		// Le repli peut décaler la durée demandée : l'avertir reste le bon
		// comportement, l'ordre des articles est de toute façon recalculé.
		if (cartCount > 0) {
			toast.info(
				"La durée s’applique à toute votre commande : les autres articles du panier seront recalculés et devront peut-être être retirés.",
			);
		}
		const duration = schedule.data
			? (resolveDuration({
					pickupDate: pickup,
					requestedDuration: nextDuration,
					durations: product.durations,
					settings: schedule.data,
				}) ?? 0)
			: nextDuration;
		if (duration !== nextDuration) {
			toast.info(
				`Le retour ne peut pas tomber un jour de fermeture : ${rentalDurationLabel(duration)} appliquée.`,
			);
		}
		setPublicCartWindow({ pickupDate: pickup, durationDays: duration });
	};

	const selectedQuote = selected
		? (quotesByVariant.get(selected.id) ?? null)
		: null;
	// Narrowing explicite : `bookableQuote` porte le prix, donc plus de double
	// lecture de `quote.data` à tester partout.
	const bookableQuote =
		selectedQuote?.status === "available" &&
		selectedQuote.unitPrice !== null &&
		selectedQuote.priceOptionId !== null
			? { ...selectedQuote, unitPrice: selectedQuote.unitPrice }
			: null;
	const bookableNow = bookableQuote !== null;

	// Le stock est la seule chose que le devis public ne puisse pas inventer :
	// sans fenêtre on se limite au total en magasin, avec fenêtre on prend ce
	// que le serveur dit rester libre, et on retire ce que le panier retient
	// déjà pour la même variante (même stock physique, durées confondues).
	const alreadyInCart = usePublicCart((state) =>
		selected ? cartVariantQuantity(state, selected.id) : 0,
	);
	const availableNow = hasWindow
		? (bookableQuote?.availableQuantity ?? 0)
		: (selected?.stock ?? 0);
	const remainingToAdd = Math.max(0, availableNow - alreadyInCart);
	// On ne descend jamais sous 1 : le champ reste utilisable, c'est le CTA qui
	// porte le refus quand il ne reste rien.
	const quantityMax = Math.max(1, Math.min(20, remainingToAdd));
	const soldOut = bookableNow && remainingToAdd === 0;

	// Changer de dates ou de variante peut rendre la quantité saisie trop grande
	// pour le nouveau stock : on la reborne.
	useEffect(() => {
		setQuantity((current) => Math.min(current, quantityMax));
	}, [quantityMax]);

	// « exemplaire » se singularise tout seul, contrairement au nom du matériel :
	// « 1 casque » ou « 1 sac à dos » demanderaient de connaître le pluriel.
	const availabilityLabel = (count: number, withWindow: boolean): string => {
		const noun = `${count} exemplaire${count > 1 ? "s" : ""}`;
		return withWindow
			? `${noun} disponible${count > 1 ? "s" : ""} pour ces dates`
			: `${noun} en stock`;
	};

	const addToCart = () => {
		if (!selected || !bookableQuote) {
			toast.error(
				selectedQuote?.message ?? "Choisissez des dates disponibles.",
			);
			return;
		}
		if (quantity > remainingToAdd) {
			toast.error(
				`Il ne reste que ${remainingToAdd} exemplaire${remainingToAdd > 1 ? "s" : ""} pour ces dates.`,
			);
			return;
		}
		addPublicCartLine({
			key: `${selected.id}:${bookableQuote.priceOptionId}`,
			productSlug: product.slug,
			productName: product.name,
			activitySlug,
			activityName: activity?.name ?? "",
			variantId: selected.id,
			variantLabel:
				describeVariantAttributes(selected.attributes) ?? "Variante standard",
			priceOptionId: bookableQuote.priceOptionId,
			duration: bookableQuote.durationDays,
			unitPrice: bookableQuote.unitPrice,
			quantity,
			imageUrl: product.image?.url ?? null,
		});
		toast.success(`${product.name} ajouté au panier`);
		void router.navigate({ to: "/panier" });
	};

	// Le CTA commun (desktop + barre mobile) : sans dates, on déroule vers le
	// sélecteur plutôt que d'échouer en silence ; sinon on ajoute au panier.
	const needsDates = !hasWindow || durationNotPriced;
	const buyLabel = !hasWindow
		? "Choisir mes dates"
		: durationNotPriced
			? "Choisir une autre durée"
			: soldOut || allSoldOut
				? "Plus d’exemplaire disponible"
				: "Ajouter au panier";
	const buyDisabled = !needsDates && (!bookableNow || soldOut);
	const onBuyClick = () => {
		if (needsDates) {
			const target = document.getElementById("choisir-dates");
			if (target) {
				const reduce = window.matchMedia(
					"(prefers-reduced-motion: reduce)",
				).matches;
				target.scrollIntoView({
					behavior: reduce ? "auto" : "smooth",
					block: "start",
				});
			}
			return;
		}
		addToCart();
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
				<div className="space-y-4">
					<div className="island-shell aspect-[4/3] overflow-hidden rounded-2xl bg-[var(--sand)]">
						{product.image ? (
							<img
								src={product.image.url}
								alt={product.image.alt ?? product.name}
								className="size-full object-cover"
								fetchPriority="high"
								decoding="async"
							/>
						) : (
							<div className="grid size-full place-items-center text-sm text-[var(--sea-ink-soft)]">
								Image à venir
							</div>
						)}
					</div>
					{product.description && (
						<p className="text-[var(--sea-ink-soft)]">{product.description}</p>
					)}
				</div>

				<div className="space-y-6">
					<div>
						<p className="island-kicker">{product.brand}</p>
						<h1 className="display-title text-4xl font-semibold">
							{product.name}
						</h1>
					</div>

					{bookableVariants.length === 0 ? (
						<div className="space-y-3">
							<p className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-white/70 p-4 text-sm">
								<TriangleAlert
									className="mt-0.5 size-4 shrink-0"
									aria-hidden="true"
								/>
								Ce matériel n’est pas reservable en ligne pour le moment. Passez
								au comptoir location du magasin.
							</p>
							{/* Sans issue, une fiche non vendable est un cul-de-sac. */}
							<Link
								to="/activite/$activitySlug"
								params={{ activitySlug }}
								className="inline-flex items-center gap-1.5 text-sm font-semibold no-underline"
							>
								<ArrowLeft className="size-4" aria-hidden="true" />
								Voir les autres matériels
							</Link>
						</div>
					) : (
						<>
							{bookableVariants.length > 1 && (
								<fieldset className="space-y-2">
									<legend className="island-kicker mb-2">
										Choix de la variante
									</legend>
									{entries.map(({ variant, support }) => {
										const offWindow =
											hasWindow && !supportsDuration(support, durationDays);
										// Une variante qui couvre la durée mais n'a plus d'exemplaire
										// libre est signalée ici : le client n'a pas à la sélectionner
										// pour découvrir qu'elle est vide.
										const variantQuote = quotesByVariant.get(variant.id);
										const soldOutVariant =
											!offWindow &&
											variantQuote?.status === "available" &&
											variantQuote.availableQuantity === 0;
										return (
											<label
												key={variant.id}
												className={cn(
													"flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white/70 p-3 text-sm",
													offWindow ? "opacity-60" : "cursor-pointer",
												)}
											>
												<input
													type="radio"
													name="variant"
													value={variant.id}
													checked={selected?.id === variant.id}
													disabled={offWindow}
													onChange={() => setVariantId(variant.id)}
												/>
												<span>
													{describeVariantAttributes(variant.attributes) ??
														"Variante standard"}
												</span>
												{offWindow || soldOutVariant ? (
													<span className="ml-auto text-xs text-[var(--sea-ink-soft)]">
														{offWindow
															? `indisponible sur ${rentalDurationLabel(durationDays).toLowerCase()}`
															: "épuisé pour ces dates"}
													</span>
												) : null}
											</label>
										);
									})}
								</fieldset>
							)}

							<Separator />

							<div className="space-y-6">
								{/* La durée choisie n'est pas tarifée pour ce matériel : on le dit, et on
							    propose les durées qui le sont, plutôt que d'afficher un titre seul. */}
								{durationNotPriced && (
									<DurationConflictNotice
										currentDuration={durationDays}
										durations={product.durations}
										priceByDuration={product.priceByDuration}
										onPickDuration={switchDuration}
										className="rounded-xl border border-[var(--line)] bg-white/70 p-4"
									/>
								)}

								{/* Les tarifs décrivent une variante : ils n'ont de sens que si l'une
							    d'elles couvre la fenêtre choisie. */}
								{selected && (
									<div>
										<h2 className="island-kicker mb-3">Tarifs</h2>
										{selected.priceOptions.length === 0 ? (
											<p className="text-sm text-[var(--sea-ink-soft)]">
												Cette variante n&rsquo;est pas disponible à la location
												en ligne. Contactez-nous pour connaître ses
												disponibilités.
											</p>
										) : (
											<ul className="space-y-2 text-sm">
												{selected.priceOptions.map((option) => (
													<li
														key={option.id}
														className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2"
													>
														<span>{option.label}</span>
														<strong>
															{Number(option.price)
																.toFixed(2)
																.replace(".", ",")}{" "}
															€
														</strong>
													</li>
												))}
											</ul>
										)}
										{hasWindow && quote.isPending ? (
											<p className="mt-3 text-sm text-[var(--sea-ink-soft)]">
												Calcul du total…
											</p>
										) : bookableQuote ? (
											<p className="mt-3 text-sm">
												Total pour
												{rentalDurationLabel(
													bookableQuote.durationDays,
												).toLowerCase()}{" "}
												:
												<strong className="text-[var(--sea-ink)]">
													{bookableQuote.unitPrice.toFixed(2).replace(".", ",")}{" "}
													€
												</strong>
											</p>
										) : (
											<p className="mt-3 text-sm text-[var(--sea-ink-soft)]">
												{selectedQuote?.message ??
													"Choisissez vos dates pour connaître le total."}
											</p>
										)}
									</div>
								)}

								{/* Plus aucune variante ne convient : on explique, et on ne laisse pas
								    le client sans porte de sortie. */}
								{blockedMessage ? (
									<div className="rounded-xl border border-[var(--line)] bg-white/70 p-4">
										<p className="flex items-start gap-2 text-sm">
											<TriangleAlert
												className="mt-0.5 size-4 shrink-0"
												aria-hidden="true"
											/>
											{blockedMessage} Choisissez d’autres dates ou un autre
											matériel.
										</p>
										<Link
											to="/activite/$activitySlug"
											params={{ activitySlug }}
											className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold no-underline"
										>
											<ArrowLeft className="size-4" aria-hidden="true" />
											Voir les autres matériels
										</Link>
									</div>
								) : null}

								{/* Le sélecteur reste atteignable même quand rien n'est vendable : c'est la
						    seule sortie de la page. */}
								<div id="choisir-dates" className="scroll-mt-24">
									<RentalWindowSelector
										hint={`Retrait ${store.pickupWindow}, retour ${store.returnWindow}. Durée minimale de ${product.minDuration} jour${product.minDuration > 1 ? "s" : ""} pour ce matériel.`}
									/>
								</div>

								{/* Ligne d'achat desktop : la barre sticky la remplace sur mobile. */}
								<div className="hidden gap-3 md:flex md:flex-wrap md:items-center">
									<label className="flex items-center gap-2 text-sm">
										Quantité
										<input
											type="number"
											min={1}
											max={quantityMax}
											value={quantity}
											onChange={(event) =>
												setQuantity(
													Math.min(
														quantityMax,
														Math.max(1, Number(event.target.value) || 1),
													),
												)
											}
											className="w-20 rounded-lg border border-[var(--line)] px-2 py-1.5"
										/>
									</label>
									<Button
										size="lg"
										onClick={onBuyClick}
										disabled={buyDisabled}
										aria-busy={quote.isFetching}
									>
										<ShoppingBasket className="size-4" aria-hidden="true" />
										{buyLabel}
									</Button>
								</div>
								{selected ? (
									<p className="text-xs text-[var(--sea-ink-soft)]">
										{availabilityLabel(availableNow, hasWindow)}
										{alreadyInCart > 0 && remainingToAdd > 0
											? ` — ${alreadyInCart} déjà dans votre panier`
											: null}
									</p>
								) : null}
								<p className="text-xs text-[var(--sea-ink-soft)]">
									{store.paymentNotice}
								</p>
							</div>
						</>
					)}
				</div>

				{/* Barre d'achat sticky mobile : quantité + CTA toujours visibles,
				    compensée par le padding bas de la page. Hors des conteneurs
				    space-y : la marge de ceux-ci décale un élément fixed de son
				    bord bas. */}
				{bookableVariants.length !== 0 && (
					<div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line)] bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur supports-[padding-bottom:env(safe-area-inset-bottom)]:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
						<div className="flex items-center gap-3">
							<label className="flex shrink-0 items-center gap-2 text-sm">
								Quantité
								<input
									type="number"
									min={1}
									max={quantityMax}
									value={quantity}
									onChange={(event) =>
										setQuantity(
											Math.min(
												quantityMax,
												Math.max(1, Number(event.target.value) || 1),
											),
										)
									}
									className="w-16 rounded-lg border border-[var(--line)] px-2 py-2"
								/>
							</label>
							<Button
								size="lg"
								className="flex-1"
								onClick={onBuyClick}
								disabled={buyDisabled}
								aria-busy={quote.isFetching}
							>
								<ShoppingBasket className="size-4" aria-hidden="true" />
								{buyLabel}
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * Ce qu'une variante sait facturer, d'après les mêmes règles que le serveur
 * (durée minimale de l'article comprise).
 */
function variantSupport(
	variant: PublicVariant,
	minDuration: number,
): ProductDurationSupport {
	return productDurationSupport({
		priceOptions: variant.priceOptions,
		minDuration,
	});
}
