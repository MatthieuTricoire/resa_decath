import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gt, inArray, lt, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { getActivityCopy } from "#/config/activities";
import { db } from "#/db";
import * as schema from "#/db/schema";
import {
	availableQuantity,
	evaluateItemAvailability,
	isItemOutOfSeason,
	type RentalAvailabilitySettings,
	type RentalSeason,
	STOCK_CONSUMING_STATUSES,
	stockShortage,
} from "#/features/reservations/availability";
import type { OpeningDaysSettings } from "#/features/reservations/opening-days";
import {
	type PriceOptionLike,
	parsePrice,
	productDurationSupport,
	quoteVariantForDuration,
} from "#/features/reservations/pricing";
import { getRentalSettingsRecord } from "#/features/settings/queries";
import { countRentalDays, dateKeyToUtcNoon } from "#/lib/dates";

/**
 * Couche de lecture publique : ne renvoie jamais les données internes
 * (SKU Decathlon, URL Decathlon, détail des réservations). Le seul chiffre de
 * stock exposé est le nombre d'exemplaires en magasin ; ce qui reste louable
 * pour une fenêtre donnée vient du devis. Les prix affichés proviennent
 * toujours des `price_options` actives, celles qui portent le code caisse.
 */

export type PublicPriceOption = {
	id: string;
	duration: number;
	label: string;
	price: string;
};

export type VariantAttribute = { name: string; value: string };

/**
 * « Taille M · Bleu », ou `null` pour une variante sans attribut : c'est ce qui
 * distingue deux variantes d'un même produit. L'attribut est capitalisé parce
 * que l'admin saisit « taille M » en minuscules et que ces libellés sont
 * destinés aux clients. Défini ici pour que la fiche produit et le
 * récapitulatif de réservation parlent du même matériel de la même façon.
 */
export function describeVariantAttributes(
	attributes: VariantAttribute[],
): string | null {
	if (attributes.length === 0) return null;
	return attributes
		.map((attribute) => {
			const name = attribute.name.trim();
			const value = attribute.value.trim();
			return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${value}`;
		})
		.join(" · ");
}

export type PublicVariant = {
	id: string;
	attributes: Array<{ name: string; value: string }>;
	/**
	 * Options de prix actives de la variante. Vide si la variante n'est pas
	 * réservable : le catalogue public n'expose jamais le prix d'un matériel
	 * retiré, en maintenance ou sans tarif.
	 */
	priceOptions: PublicPriceOption[];
	/**
	 * Une variante est réservable en ligne si elle est disponible et possède au
	 * moins une option de prix active.
	 */
	bookable: boolean;
	/**
	 * Exemplaires en magasin. C'est le seul chiffre de stock exposé, et il ne
	 * dit rien des réservations existantes : ce qui reste réellement louable
	 * pour une fenêtre donnée arrive avec le devis.
	 */
	stock: number;
};

export type PublicProductImage = { url: string; alt: string | null };

export type PublicProductSummary = {
	slug: string;
	name: string;
	brand: string;
	image: PublicProductImage | null;
	/** Prix « à partir de », `null` si le produit n'a aucun prix exploitable. */
	priceFrom: string | null;
	/**
	 * Durées que ce produit peut réellement facturer, via une option de prix
	 * active et au-dessus de sa durée minimale. Sert à griser la fiche quand la
	 * fenêtre choisie n'est pas couverte.
	 */
	durations: number[];
	/**
	 * Le produit est-il vendable en ligne ? `false` si aucune de ses variantes
	 * n'est réservable : l'artifact est alors affiché sans prix plutôt que grisé
	 * pour une durée, ce qui veut dire autre chose.
	 */
	bookable: boolean;
	/**
	 * Prix par durée, issu des options actives. L'objet est indexé par la durée
	 * pour être lu directement : `priceByDuration[3]`.
	 */
	priceByDuration: Record<number, number>;
};

export type PublicProduct = PublicProductSummary & {
	/** Catégorie (= activité) du matériel, pour vérifier l'URL de la fiche. */
	activitySlug: string;
	description: string | null;
	images: PublicProductImage[];
	variants: PublicVariant[];
	minDuration: number;
	availableFrom: string | null;
	availableTo: string | null;
};

export type PublicActivity = {
	slug: string;
	name: string;
	description: string;
	itemCount: number;
};

/**
 * Activité revenue du catalogue : la catégorie ne contient que du matériel de la
 * saison opposée. L'accueil la signale dans un encart « de retour… ».
 */
export type PublicActivitySeasonNote = {
	name: string;
	/** Saison de retour : celle du matériel de la catégorie, opposée à l'active. */
	returnSeason: Exclude<RentalSeason, "all">;
};

type ProductRow = {
	id: string;
	name: string;
	slug: string;
	brand: string;
	description: string | null;
	categoryId: string;
	categorySlug: string;
	categoryName: string;
	minDuration: number;
	availableFrom: string | null;
	availableTo: string | null;
	season: RentalSeason;
};

type ProductBundle = {
	product: ProductRow;
	images: PublicProductImage[];
	variants: PublicVariant[];
	priceFrom: string | null;
};

/** Réservable en ligne : disponible, avec au moins un tarif actif. */
function isVariantBookable(
	status: string,
	priceOptions: PublicPriceOption[],
): boolean {
	return status === "AVAILABLE" && priceOptions.length > 0;
}

/** Prix d'entrée public : le plus petit prix actif de la variante. */
function entryPrice(priceOptions: PublicPriceOption[]): number | null {
	if (priceOptions.length === 0) return null;
	const prices = priceOptions
		.map((option) => parsePrice(option.price))
		.filter((price): price is number => price !== null);
	return prices.length > 0 ? Math.min(...prices) : null;
}

/** Charge produits, images, variantes, options actives et attributs. */
async function loadProductBundles(
	where: SQL | undefined,
): Promise<ProductBundle[]> {
	const products = await db
		.select({
			id: schema.items.id,
			name: schema.items.name,
			slug: schema.items.slug,
			brand: schema.items.brand,
			description: schema.items.description,
			categoryId: schema.items.categoryId,
			categorySlug: schema.categories.slug,
			categoryName: schema.categories.name,
			minDuration: schema.items.minDuration,
			availableFrom: schema.items.availableFrom,
			availableTo: schema.items.availableTo,
			season: schema.items.season,
		})
		.from(schema.items)
		.innerJoin(
			schema.categories,
			eq(schema.items.categoryId, schema.categories.id),
		)
		.where(where)
		.orderBy(asc(schema.items.name));

	if (products.length === 0) return [];

	const productIds = products.map((product) => product.id);
	const variantRows = await db
		.select({
			id: schema.itemVariants.id,
			itemId: schema.itemVariants.itemId,
			status: schema.itemVariants.status,
			totalStock: schema.itemVariants.totalStock,
		})
		.from(schema.itemVariants)
		.where(inArray(schema.itemVariants.itemId, productIds))
		.orderBy(asc(schema.itemVariants.id));
	const variantIds = variantRows.map((variant) => variant.id);

	const [imageRows, optionRows, attributeRows] = await Promise.all([
		db
			.select({
				itemId: schema.itemImages.itemId,
				url: schema.itemImages.url,
				alt: schema.itemImages.alt,
			})
			.from(schema.itemImages)
			.where(inArray(schema.itemImages.itemId, productIds))
			.orderBy(asc(schema.itemImages.sortOrder)),
		variantIds.length > 0
			? db
					.select({
						id: schema.priceOptions.id,
						variantId: schema.priceOptions.variantId,
						duration: schema.priceOptions.duration,
						label: schema.priceOptions.label,
						price: schema.priceOptions.price,
					})
					.from(schema.priceOptions)
					.where(
						and(
							inArray(schema.priceOptions.variantId, variantIds),
							eq(schema.priceOptions.isActive, true),
						),
					)
					.orderBy(asc(schema.priceOptions.duration))
			: Promise.resolve([]),
		variantIds.length > 0
			? db
					.select({
						variantId: schema.variantAttributes.variantId,
						name: schema.variantAttributes.name,
						value: schema.variantAttributes.value,
					})
					.from(schema.variantAttributes)
					.where(inArray(schema.variantAttributes.variantId, variantIds))
			: Promise.resolve([]),
	]);

	const imagesByProduct = new Map<string, PublicProductImage[]>();
	for (const image of imageRows) {
		const list = imagesByProduct.get(image.itemId) ?? [];
		list.push({ url: image.url, alt: image.alt });
		imagesByProduct.set(image.itemId, list);
	}

	const optionsByVariant = new Map<string, PublicPriceOption[]>();
	for (const option of optionRows) {
		const list = optionsByVariant.get(option.variantId) ?? [];
		list.push({
			id: option.id,
			duration: option.duration,
			label: option.label,
			price: option.price,
		});
		optionsByVariant.set(option.variantId, list);
	}

	const attributesByVariant = new Map<
		string,
		Array<{ name: string; value: string }>
	>();
	for (const attribute of attributeRows) {
		const list = attributesByVariant.get(attribute.variantId) ?? [];
		list.push({ name: attribute.name, value: attribute.value });
		attributesByVariant.set(attribute.variantId, list);
	}

	return products.map((product) => {
		const variants: PublicVariant[] = variantRows
			.filter((variant) => variant.itemId === product.id)
			.map((variant) => {
				const options = optionsByVariant.get(variant.id) ?? [];
				const bookable = isVariantBookable(variant.status, options);
				return {
					id: variant.id,
					attributes: attributesByVariant.get(variant.id) ?? [],
					// Une variante non vendable n'expose aucun prix : le client ne
					// peut ainsi pas voir un tarif qu'il ne pourra pas payer.
					priceOptions: bookable ? options : [],
					bookable,
					stock: Math.max(0, Number(variant.totalStock ?? 0)),
				};
			});
		const prices = variants
			.map((variant) => entryPrice(variant.priceOptions))
			.filter((price): price is number => price !== null);

		return {
			product,
			images: imagesByProduct.get(product.id) ?? [],
			variants,
			priceFrom: prices.length > 0 ? Math.min(...prices).toFixed(2) : null,
		};
	});
}

/**
 * Options à prendre en compte pour un produit : celles de ses variantes
 * réservables. Comme le prix d'une variante non vendable n'est pas exposé,
 * l'invariant tient sans test supplémentaire.
 */
function bookablePriceOptions(variants: PublicVariant[]): PublicPriceOption[] {
	return variants.flatMap((variant) => variant.priceOptions);
}

function toSummary(bundle: ProductBundle): PublicProductSummary {
	// Miroir de ce que la réservation refuserait : calculé ici, en une passe,
	// sur des données déjà chargées.
	const support = productDurationSupport({
		priceOptions: bookablePriceOptions(bundle.variants),
		minDuration: bundle.product.minDuration,
	});
	return {
		slug: bundle.product.slug,
		name: bundle.product.name,
		brand: bundle.product.brand,
		image: bundle.images[0] ?? null,
		priceFrom: bundle.priceFrom,
		durations: support.durations,
		bookable: support.durations.length > 0,
		priceByDuration: { ...support.priceByDuration },
	};
}

function isCatalogVisible(bundle: ProductBundle): boolean {
	return bundle.variants.some((variant) => variant.bookable);
}

/** Un bundle hors saison pour la date courante, selon les réglages. */
function isOutOfSeasonBundle(
	bundle: ProductBundle,
	settings: RentalAvailabilitySettings,
): boolean {
	return isItemOutOfSeason({ season: bundle.product.season }, settings);
}

/** `getPublicProduct`, sans la vérification de saison : la page fiche. */
function bundleToPublicProduct(bundle: ProductBundle): PublicProduct {
	return {
		...toSummary(bundle),
		activitySlug: bundle.product.categorySlug,
		description: bundle.product.description,
		images: bundle.images,
		variants: bundle.variants,
		minDuration: bundle.product.minDuration,
		availableFrom: bundle.product.availableFrom,
		availableTo: bundle.product.availableTo,
	};
}

const categorySlugSchema = z.string().min(1);
const productSlugSchema = z.string().min(1);

export const getPublicActivities = createServerFn({ method: "GET" }).handler(
	async (): Promise<{
		activities: PublicActivity[];
		hidden: PublicActivitySeasonNote[];
	}> => {
		const settings = await getRentalSettingsRecord();
		const bundles = (await loadProductBundles(undefined)).filter(
			isCatalogVisible,
		);

		// Une catégorie est masquée quand tout son matériel est hors saison. On
		// compte d'abord ce qui reste visible de chaque catégorie, pour n'écarter
		// que les catégories à zéro produit réservable ce jour-là.
		const visibleCount = new Map<string, number>();
		const hiddenCount = new Map<string, number>();
		const seasonByCategory = new Map<string, RentalSeason>();
		for (const bundle of bundles) {
			const { categorySlug, season } = bundle.product;
			if (isOutOfSeasonBundle(bundle, settings)) {
				hiddenCount.set(categorySlug, (hiddenCount.get(categorySlug) ?? 0) + 1);
				seasonByCategory.set(categorySlug, season);
			} else {
				visibleCount.set(
					categorySlug,
					(visibleCount.get(categorySlug) ?? 0) + 1,
				);
			}
		}

		const activities = new Map<string, PublicActivity>();
		const hidden: PublicActivitySeasonNote[] = [];
		for (const bundle of bundles) {
			// Le compteur de la carte n'annonce que le matériel réservable
			// aujourd'hui : un article hors saison d'une catégorie mixte ne doit
			// pas gonfler le badge.
			if (isOutOfSeasonBundle(bundle, settings)) continue;
			const { categorySlug, categoryName } = bundle.product;
			// On n'annonce une catégorie qu'une fois : `itemCount` est posé au
			// premier bundle, les suivants se contentent d'incrémenter.
			const current = activities.get(categorySlug);
			if (current) {
				current.itemCount += 1;
				continue;
			}
			const copy = getActivityCopy(categorySlug, categoryName);
			activities.set(categorySlug, {
				slug: categorySlug,
				name: categoryName,
				description: copy.card,
				itemCount: 1,
			});
		}
		for (const categorySlug of hiddenCount.keys()) {
			if ((visibleCount.get(categorySlug) ?? 0) > 0) continue;
			const bundle = bundles.find(
				(candidate) => candidate.product.categorySlug === categorySlug,
			);
			const season = seasonByCategory.get(categorySlug);
			if (!bundle || !season || season === "all") continue;
			hidden.push({
				name: bundle.product.categoryName,
				returnSeason: season,
			});
		}

		return {
			activities: [...activities.values()].sort((a, b) =>
				a.name.localeCompare(b.name, "fr"),
			),
			hidden,
		};
	},
);

export const getPublicActivity = createServerFn({ method: "GET" })
	.inputValidator((slug: string) => categorySlugSchema.parse(slug))
	.handler(async ({ data }): Promise<PublicActivity | null> => {
		const settings = await getRentalSettingsRecord();
		const bundles = (
			await loadProductBundles(eq(schema.categories.slug, data))
		).filter(
			(bundle) =>
				isCatalogVisible(bundle) && !isOutOfSeasonBundle(bundle, settings),
		);
		const first = bundles[0];
		if (!first) return null;
		return {
			slug: first.product.categorySlug,
			name: first.product.categoryName,
			description: getActivityCopy(
				first.product.categorySlug,
				first.product.categoryName,
			).card,
			itemCount: bundles.length,
		};
	});

export const getPublicActivityProducts = createServerFn({ method: "GET" })
	.inputValidator((slug: string) => categorySlugSchema.parse(slug))
	.handler(async ({ data }): Promise<PublicProductSummary[]> => {
		const settings = await getRentalSettingsRecord();
		const bundles = (
			await loadProductBundles(eq(schema.categories.slug, data))
		).filter(
			(bundle) =>
				isCatalogVisible(bundle) && !isOutOfSeasonBundle(bundle, settings),
		);
		return bundles.map(toSummary);
	});

export const getPublicProduct = createServerFn({ method: "GET" })
	.inputValidator((slug: string) => productSlugSchema.parse(slug))
	.handler(async ({ data }): Promise<PublicProduct | null> => {
		const bundle = (await loadProductBundles(eq(schema.items.slug, data)))[0];
		if (!bundle) return null;
		return bundleToPublicProduct(bundle);
	});

/**
 * Fiche produit, filtrée par la saison courante : la page du matériel d'été
 * renvoie `null` en hiver, comme une fiche d'un produit disparu.
 *
 * Ce filtre ne s'applique qu'à la navigation. `getPublicProduct` reste sans
 * saison pour la réservation et la réconciliation de panier : c'est le devis
 * qui y refuse le matériel hors saison avec son message propre, plus utile
 * qu'un « introuvable » au moment de payer.
 */
export const getPublicProductInSeason = createServerFn({ method: "GET" })
	.inputValidator((slug: string) => productSlugSchema.parse(slug))
	.handler(async ({ data }): Promise<PublicProduct | null> => {
		const bundle = (await loadProductBundles(eq(schema.items.slug, data)))[0];
		if (!bundle) return null;
		if (isOutOfSeasonBundle(bundle, await getRentalSettingsRecord())) {
			return null;
		}
		return bundleToPublicProduct(bundle);
	});

/* -------------------------------------------------------------------------- */
/* Devis : prix et disponibilité pour une fenêtre de location                  */
/* -------------------------------------------------------------------------- */

/**
 * Durées proposées dans le sélecteur global.
 *
 * Une durée n'est proposée que si au moins un article du catalogue la facture :
 * on ne peut donc pas choisir une fenêtre qui ne mènerait à aucune commande
 * possible. L'ensemble vient des options de prix actives, filtrées par la durée
 * minimale de chaque article. Un catalogue sans aucun prix renvoie une liste
 * vide, et le sélecteur l'annonce plutôt que d'inventer des durées.
 */
export const getPublicRentalDurations = createServerFn({
	method: "GET",
}).handler(async (): Promise<number[]> => {
	// Requêtes volontairement light : ni images ni attributs, cet endpoint est
	// sur le chemin critique de l'accueil.
	const [settings, productRows, variantRows, optionRows] = await Promise.all([
		getRentalSettingsRecord(),
		db
			.select({
				id: schema.items.id,
				minDuration: schema.items.minDuration,
				season: schema.items.season,
			})
			.from(schema.items),
		db
			.select({
				id: schema.itemVariants.id,
				itemId: schema.itemVariants.itemId,
				status: schema.itemVariants.status,
			})
			.from(schema.itemVariants)
			.where(eq(schema.itemVariants.status, "AVAILABLE")),
		db
			.select({
				id: schema.priceOptions.id,
				variantId: schema.priceOptions.variantId,
				duration: schema.priceOptions.duration,
				label: schema.priceOptions.label,
				price: schema.priceOptions.price,
			})
			.from(schema.priceOptions)
			.where(eq(schema.priceOptions.isActive, true)),
	]);

	const optionsByVariant = new Map<string, typeof optionRows>();
	for (const option of optionRows) {
		optionsByVariant.set(option.variantId, [
			...(optionsByVariant.get(option.variantId) ?? []),
			option,
		]);
	}
	const priceOptionsByItem = new Map<string, PublicPriceOption[]>();
	for (const variant of variantRows) {
		const options = optionsByVariant.get(variant.id) ?? [];
		if (options.length === 0) continue;
		priceOptionsByItem.set(variant.itemId, [
			...(priceOptionsByItem.get(variant.itemId) ?? []),
			...options,
		]);
	}

	const durations = new Set<number>();
	for (const product of productRows) {
		// Une durée servie uniquement par du matériel hors saison ne doit pas
		// rester proposée : elle ne mènerait à aucune commande possible.
		if (isItemOutOfSeason({ season: product.season }, settings)) continue;
		const support = productDurationSupport({
			priceOptions: priceOptionsByItem.get(product.id) ?? [],
			minDuration: product.minDuration,
		});
		for (const duration of support.durations) {
			durations.add(duration);
		}
	}

	return [...durations].sort((a, b) => a - b);
});

/**
 * Jours d'ouverture du magasin, pour les calendriers et les horaires publics.
 *
 * Une seule donnée suffit : l'ouverture du dimanche, les autres jours étant
 * toujours ouverts. Le serveur la relit pour chaque réservation, ce endpoint
 * sert donc uniquement à proposer des dates et des durées déjà valides plutôt
 * qu'à autoriser quoi que ce soit.
 */
export const getPublicStoreSchedule = createServerFn({
	method: "GET",
}).handler(async (): Promise<OpeningDaysSettings> => {
	const settings = await getRentalSettingsRecord();
	return { sundayOpen: settings.sundayOpen };
});

/**
 * Une réservation n'a qu'une période, partagée par toutes ses lignes
 * (`reservations.pickup_date` / `return_date`). Un devis porte donc toujours
 * sur une fenêtre, jamais sur une durée propre à un article.
 */
export type PublicQuoteStatus =
	| "available"
	| "no_price_for_duration"
	| "unavailable";

export type PublicWindowQuote = {
	variantId: string;
	status: PublicQuoteStatus;
	/** Raison technique, utile pour le débogage et les tests. */
	reason: string | null;
	/** Message affichable au client, `null` si le devis est bon. */
	message: string | null;
	durationDays: number;
	priceOptionId: string | null;
	unitPrice: number | null;
	label: string | null;
	/**
	 * Exemplaires encore libres sur la fenêtre, une fois les réservations qui
	 * la chevauchent déduites. Le panier du client n'est pas compté : il le
	 * déduit lui-même avant d'afficher son plafond.
	 */
	availableQuantity: number;
};

export type PublicCartQuote = {
	durationDays: number;
	lines: Array<PublicWindowQuote & { quantity: number }>;
	/** Somme des lignes tarifées, les lignes non tarifées compte 0. */
	total: number;
	/** `true` si toutes les lignes sont tarifées et disponibles. */
	complete: boolean;
};

const dateKeySchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");

const windowFields = {
	pickupDate: dateKeySchema,
	returnDate: dateKeySchema,
} as const;

/** Fenêtre valide : le retour n'est jamais antérieur au retrait. */
function checkWindow(
	window: { pickupDate: string; returnDate: string },
	ctx: z.RefinementCtx,
): void {
	if (window.returnDate < window.pickupDate) {
		ctx.addIssue({
			code: "custom",
			message: "Le retour doit être postérieur ou égal au retrait",
			path: ["returnDate"],
		});
		return;
	}
	if (countRentalDays(window.pickupDate, window.returnDate) < 1) {
		ctx.addIssue({
			code: "custom",
			message: "Durée de location invalide",
			path: ["returnDate"],
		});
	}
}

const windowQuoteSchema = z
	.object({
		...windowFields,
		variantIds: z.array(z.string().uuid()).min(1).max(8),
	})
	.superRefine(checkWindow);

const cartQuoteSchema = z
	.object({
		...windowFields,
		lines: z
			.array(
				z.object({
					variantId: z.string().uuid(),
					quantity: z.number().int().min(1).max(20),
				}),
			)
			.min(1)
			.max(50),
	})
	.superRefine(checkWindow);

const availabilityMessages: Record<string, (itemName: string) => string> = {
	rentals_closed: () => "Les locations sont actuellement fermées.",
	variant_unavailable: (itemName) =>
		`« ${itemName} » n’est pas disponible à la location.`,
	outside_item_period: (itemName) =>
		`La période de disponibilité de « ${itemName} » ne couvre pas votre fenêtre de location.`,
	below_minimum_duration: (itemName) =>
		`La durée de location est trop courte pour « ${itemName} ».`,
	season_not_configured: () => "Le calendrier saisonnier n’est pas configuré.",
	outside_active_season: (itemName) =>
		`« ${itemName} » n’est pas disponible sur toute votre fenêtre de location.`,
};

const pricingMessages: Record<string, string> = {
	price_option_required: "Cette variante exige une option de durée.",
	unknown_price_option: "Cette option de prix n’est plus disponible.",
	duration_not_priced:
		"Aucune option de prix ne couvre la durée de votre fenêtre.",
	invalid_duration: "Durée de location invalide.",
};

type QuoteVariantRow = {
	id: string;
	itemName: string;
	status: string;
	season: "winter" | "summer" | "all";
	availableFrom: string | null;
	availableTo: string | null;
	minDuration: number;
	totalStock: number;
};

/**
 * Quantités déjà réservées sur la fenêtre, par variante. Même prédicat de
 * chevauchement que `reserve.ts` : une réservation bloque l'exemplaire si son
 * retour est après le retrait demandé et sa fin après le début demandé.
 */
async function loadReservedQuantities(
	variantIds: string[],
	window: { pickup: Date; returnDate: Date },
): Promise<Map<string, number>> {
	const reserved = new Map<string, number>();
	if (variantIds.length === 0) return reserved;

	const rows = await db
		.select({
			variantId: schema.reservationItems.variantId,
			reservedQuantity: sql<number>`COALESCE(SUM(${schema.reservationItems.quantity}), 0)::int`,
		})
		.from(schema.reservationItems)
		.innerJoin(
			schema.reservations,
			eq(schema.reservationItems.reservationId, schema.reservations.id),
		)
		.where(
			and(
				inArray(schema.reservationItems.variantId, variantIds),
				inArray(schema.reservations.status, [...STOCK_CONSUMING_STATUSES]),
				lt(schema.reservations.pickupDate, window.returnDate),
				gt(schema.reservations.returnDate, window.pickup),
			),
		)
		.groupBy(schema.reservationItems.variantId);

	for (const row of rows) {
		reserved.set(row.variantId, Number(row.reservedQuantity));
	}
	return reserved;
}

/**
 * Devis groupé : une requête de variantes, une d'options actives, une de
 * réglages, quelle que soit la taille de la commande.
 */
async function loadWindowQuotes(
	variantIds: string[],
	window: { pickupDate: string; returnDate: string },
): Promise<Map<string, PublicWindowQuote>> {
	const quotes = new Map<string, PublicWindowQuote>();
	if (variantIds.length === 0) return quotes;

	const pickup = dateKeyToUtcNoon(window.pickupDate);
	const returnDate = dateKeyToUtcNoon(window.returnDate);
	if (!pickup || !returnDate) return quotes;
	const durationDays = countRentalDays(window.pickupDate, window.returnDate);

	const [settings, variants, optionRows, reservedByVariant] = await Promise.all(
		[
			getRentalSettingsRecord(),
			db
				.select({
					id: schema.itemVariants.id,
					itemName: schema.items.name,
					status: schema.itemVariants.status,
					season: schema.items.season,
					availableFrom: schema.items.availableFrom,
					availableTo: schema.items.availableTo,
					minDuration: schema.items.minDuration,
					totalStock: schema.itemVariants.totalStock,
				})
				.from(schema.itemVariants)
				.innerJoin(
					schema.items,
					eq(schema.itemVariants.itemId, schema.items.id),
				)
				.where(inArray(schema.itemVariants.id, variantIds)),
			db
				.select({
					id: schema.priceOptions.id,
					variantId: schema.priceOptions.variantId,
					duration: schema.priceOptions.duration,
					label: schema.priceOptions.label,
					price: schema.priceOptions.price,
				})
				.from(schema.priceOptions)
				.where(
					and(
						inArray(schema.priceOptions.variantId, variantIds),
						eq(schema.priceOptions.isActive, true),
					),
				),
			loadReservedQuantities(variantIds, { pickup, returnDate }),
		],
	);

	const optionsByVariant = new Map<string, PriceOptionLike[]>();
	for (const option of optionRows) {
		const list = optionsByVariant.get(option.variantId) ?? [];
		list.push(option);
		optionsByVariant.set(option.variantId, list);
	}

	for (const variant of variants) {
		quotes.set(
			variant.id,
			quoteOneVariant(variant, {
				priceOptions: optionsByVariant.get(variant.id) ?? [],
				settings,
				pickup,
				returnDate,
				durationDays,
				availableQuantity: availableQuantity(
					variant.totalStock,
					reservedByVariant.get(variant.id),
				),
			}),
		);
	}
	return quotes;
}

function quoteOneVariant(
	variant: QuoteVariantRow,
	context: {
		priceOptions: PriceOptionLike[];
		settings: RentalAvailabilitySettings;
		pickup: Date;
		returnDate: Date;
		durationDays: number;
		availableQuantity: number;
	},
): PublicWindowQuote {
	const unpriced = (reason: string, message: string): PublicWindowQuote => ({
		variantId: variant.id,
		status: "no_price_for_duration",
		reason,
		message,
		durationDays: context.durationDays,
		priceOptionId: null,
		unitPrice: null,
		label: null,
		availableQuantity: context.availableQuantity,
	});

	const availability = evaluateItemAvailability({
		item: variant,
		settings: context.settings,
		pickupDate: context.pickup,
		returnDate: context.returnDate,
	});
	if (!availability.available) {
		const reason = availability.reason ?? "outside_active_season";
		const message =
			availabilityMessages[reason]?.(variant.itemName) ??
			availabilityMessages.outside_active_season(variant.itemName);
		return {
			variantId: variant.id,
			status: "unavailable",
			reason,
			message,
			durationDays: context.durationDays,
			priceOptionId: null,
			unitPrice: null,
			label: null,
			availableQuantity: context.availableQuantity,
		};
	}

	const quote = quoteVariantForDuration({
		priceOptions: context.priceOptions,
		durationDays: context.durationDays,
	});
	if (quote.status !== "priced") {
		return unpriced(
			quote.reason,
			pricingMessages[quote.reason] ?? pricingMessages.duration_not_priced,
		);
	}

	return {
		variantId: variant.id,
		status: "available",
		reason: null,
		message: null,
		durationDays: context.durationDays,
		priceOptionId: quote.priceOptionId,
		unitPrice: quote.unitPrice,
		label: quote.label,
		availableQuantity: context.availableQuantity,
	};
}

/**
 * Une fiche produit et ses variantes : le devis de chacune revient dans un seul
 * aller-retour, ce qui permet d'annoncer « épuisé » sur une variante avant même
 * de la sélectionner.
 */
export const getPublicWindowQuotes = createServerFn({ method: "GET" })
	.inputValidator(windowQuoteSchema)
	.handler(async ({ data }): Promise<PublicWindowQuote[]> => {
		const quotes = await loadWindowQuotes(data.variantIds, {
			pickupDate: data.pickupDate,
			returnDate: data.returnDate,
		});
		return data.variantIds
			.map((variantId) => quotes.get(variantId))
			.filter((quote): quote is PublicWindowQuote => quote !== undefined);
	});

/** Toute la commande, pour re-valoriser le panier quand la fenêtre change. */
export const getPublicCartQuote = createServerFn({ method: "GET" })
	.inputValidator(cartQuoteSchema)
	.handler(async ({ data }): Promise<PublicCartQuote> => {
		const durationDays = countRentalDays(data.pickupDate, data.returnDate);
		const quotes = await loadWindowQuotes(
			data.lines.map((line) => line.variantId),
			{ pickupDate: data.pickupDate, returnDate: data.returnDate },
		);

		const lines = data.lines.map((line) => {
			const quote = quotes.get(line.variantId);
			const fallback: PublicWindowQuote = {
				variantId: line.variantId,
				status: "unavailable",
				reason: "variant_unavailable",
				message: "Ce matériel n’est plus disponible à la location.",
				durationDays,
				priceOptionId: null,
				unitPrice: null,
				label: null,
				availableQuantity: 0,
			};
			return { ...(quote ?? fallback), quantity: line.quantity };
		});

		return {
			durationDays,
			lines,
			total: lines.reduce(
				(sum, line) => sum + (line.unitPrice ?? 0) * line.quantity,
				0,
			),
			complete: lines.every(
				(line) =>
					line.status === "available" &&
					!stockShortage(line.quantity, line.availableQuantity),
			),
		};
	});

/* -------------------------------------------------------------------------- */
/* Panier : identité des lignes restaurées                                    */
/* -------------------------------------------------------------------------- */

/**
 * Identité d'une ligne de panier, relue depuis la base.
 *
 * Le panier survit à un rechargement grâce au `sessionStorage`, et il transporte
 * donc des noms, des images et des slugs figés au moment de l'ajout. Or le slug
 * fait autorité à la réservation : `reservePublicReservation` résout chaque ligne
 * par `getPublicProduct(slug)` et refuse un produit introuvable. Un article
 * renommé ou déplacé entre l'ajout et le paiement ferait donc échouer la
 * commande pour une raison invisible. Ce récapitulatif permet de le rattraper
 * avant, et d'écarter les matériels sortis du circuit.
 *
 * Le prix et la durée ne viennent pas d'ici : ils appartiennent au devis et à la
 * fenêtre de location, qui font foi.
 */
export type PublicCartLineIdentity = {
	variantId: string;
	productSlug: string;
	productName: string;
	activitySlug: string;
	activityName: string;
	variantLabel: string;
	imageUrl: string | null;
};

/**
 * Réconcilie les variantes d'un panier restauré. Une variante absente du
 * résultat n'existe plus ou n'est plus louable : c'est à l'appelant de retirer
 * la ligne. `MAINTENANCE` et `RETIRED` sont traités comme disparus, un casque en
 * réparation n'ayant rien à faire dans un panier.
 */
export const getPublicCartIdentities = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({ variantIds: z.array(z.string().uuid()).min(1).max(50) }),
	)
	.handler(async ({ data }): Promise<PublicCartLineIdentity[]> => {
		// Une seule passe pour les produits : la jointure variantes → items →
		// catégories donne tout ce qu'il faut, la photo et les attributs
		// venant en deux requêtes groupées sur les ids déjà connus.
		const variantRows = await db
			.select({
				variantId: schema.itemVariants.id,
				status: schema.itemVariants.status,
				productSlug: schema.items.slug,
				productName: schema.items.name,
				itemId: schema.items.id,
				activitySlug: schema.categories.slug,
				activityName: schema.categories.name,
			})
			.from(schema.itemVariants)
			.innerJoin(schema.items, eq(schema.itemVariants.itemId, schema.items.id))
			.innerJoin(
				schema.categories,
				eq(schema.items.categoryId, schema.categories.id),
			)
			.where(inArray(schema.itemVariants.id, data.variantIds));

		const rentable = variantRows.filter(
			(variant) => variant.status === "AVAILABLE",
		);
		if (rentable.length === 0) return [];

		const [imageRows, attributeRows] = await Promise.all([
			db
				.select({
					itemId: schema.itemImages.itemId,
					url: schema.itemImages.url,
				})
				.from(schema.itemImages)
				.where(
					inArray(schema.itemImages.itemId, [
						...new Set(rentable.map((variant) => variant.itemId)),
					]),
				)
				.orderBy(asc(schema.itemImages.sortOrder)),
			db
				.select({
					variantId: schema.variantAttributes.variantId,
					name: schema.variantAttributes.name,
					value: schema.variantAttributes.value,
				})
				.from(schema.variantAttributes)
				.where(
					inArray(
						schema.variantAttributes.variantId,
						rentable.map((variant) => variant.variantId),
					),
				),
		]);

		// Première image de chaque produit, dans l'ordre défini par l'admin.
		const imageByItem = new Map<string, string>();
		for (const image of imageRows) {
			if (!imageByItem.has(image.itemId))
				imageByItem.set(image.itemId, image.url);
		}
		const attributesByVariant = new Map<string, VariantAttribute[]>();
		for (const attribute of attributeRows) {
			const list = attributesByVariant.get(attribute.variantId) ?? [];
			list.push({ name: attribute.name, value: attribute.value });
			attributesByVariant.set(attribute.variantId, list);
		}

		return rentable.map((variant) => ({
			variantId: variant.variantId,
			productSlug: variant.productSlug,
			productName: variant.productName,
			activitySlug: variant.activitySlug,
			activityName: variant.activityName,
			variantLabel:
				describeVariantAttributes(
					attributesByVariant.get(variant.variantId) ?? [],
				) ?? "Variante standard",
			imageUrl: imageByItem.get(variant.itemId) ?? null,
		}));
	});
