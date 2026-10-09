import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { requireDashboardSession } from "#/features/auth/queries";
import {
	evaluateItemAvailability,
	STOCK_CONSUMING_STATUSES,
} from "#/features/reservations/availability";
import { getRentalSettingsRecord } from "#/features/settings/queries";
import { makeUniqueSlug } from "#/lib/slug";

export type VariantAttribute = {
	name: string;
	value: string;
};

export type PriceOptionRow = {
	id: string;
	label: string;
	duration: number;
	price: string;
	barcode: string;
	isActive: boolean;
};

export type VariantRow = {
	id: string;
	decathlonSku: string | null;
	totalStock: number;
	/**
	 * Prix de la durée la plus courte, pour les listes qui n'ont qu'une ligne à
	 * afficher. `null` si la variante n'a aucun tarif.
	 */
	shortestPrice: string | null;
	itemName: string;
	brand: string;
	itemId: string;
	categoryName: string;
	categoryId: string;
	status: string;
	season: "winter" | "summer" | "all";
	availableFrom: string | null;
	availableTo: string | null;
	minDuration: number;
	attributes: VariantAttribute[];
	priceOptions: PriceOptionRow[];
};

export const getCategories = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireDashboardSession();
		const categories = await db
			.select()
			.from(schema.categories)
			.orderBy(schema.categories.name);
		return categories;
	},
);

export const createCategory = createServerFn({ method: "POST" })
	.validator(
		z.object({
			name: z.string().min(1, "Le nom est requis"),
			description: z.string().nullable().optional(),
		}).parse,
	)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		const slug = await makeUniqueSlug(data.name, async (candidate) => {
			const [existing] = await db
				.select({ id: schema.categories.id })
				.from(schema.categories)
				.where(eq(schema.categories.slug, candidate))
				.limit(1);
			return Boolean(existing);
		});

		const [category] = await db
			.insert(schema.categories)
			.values({
				name: data.name,
				slug,
				description: data.description?.trim() || null,
			})
			.returning();

		return category;
	});

export const deleteCategory = createServerFn({ method: "POST" })
	.validator((id: string) => id)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		await db.delete(schema.categories).where(eq(schema.categories.id, data));
	});

export const updateCategory = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: z.string().uuid(),
			name: z.string().min(1, "Le nom est requis"),
			description: z.string().nullable().optional(),
		}).parse,
	)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		const slug = await makeUniqueSlug(data.name, async (candidate) => {
			const [existing] = await db
				.select({ id: schema.categories.id })
				.from(schema.categories)
				.where(
					and(
						eq(schema.categories.slug, candidate),
						ne(schema.categories.id, data.id),
					),
				)
				.limit(1);
			return Boolean(existing);
		});

		await db
			.update(schema.categories)
			.set({
				name: data.name,
				slug,
				description: data.description?.trim() || null,
			})
			.where(eq(schema.categories.id, data.id));
	});

async function loadVariants(): Promise<VariantRow[]> {
	const raw = await db
		.select({
			id: schema.itemVariants.id,
			decathlonSku: schema.itemVariants.decathlonSku,
			totalStock: schema.itemVariants.totalStock,
			itemName: schema.items.name,
			brand: schema.items.brand,
			itemId: schema.items.id,
			categoryName: schema.categories.name,
			categoryId: schema.categories.id,
			status: schema.itemVariants.status,
			season: schema.items.season,
			availableFrom: schema.items.availableFrom,
			availableTo: schema.items.availableTo,
			minDuration: schema.items.minDuration,
			attributeName: schema.variantAttributes.name,
			attributeValue: schema.variantAttributes.value,
		})
		.from(schema.itemVariants)
		.innerJoin(schema.items, eq(schema.itemVariants.itemId, schema.items.id))
		.innerJoin(
			schema.categories,
			eq(schema.items.categoryId, schema.categories.id),
		)
		.leftJoin(
			schema.variantAttributes,
			eq(schema.itemVariants.id, schema.variantAttributes.variantId),
		)
		.orderBy(asc(schema.items.name));

	const variantIds = raw.map((r) => r.id);
	const uniqueIds = [...new Set(variantIds)];

	const priceOptRows =
		uniqueIds.length > 0
			? await db
					.select()
					.from(schema.priceOptions)
					.where(
						and(
							inArray(schema.priceOptions.variantId, uniqueIds),
							eq(schema.priceOptions.isActive, true),
						),
					)
			: [];

	const priceOptMap = new Map<string, PriceOptionRow[]>();
	for (const po of priceOptRows) {
		if (!priceOptMap.has(po.variantId)) {
			priceOptMap.set(po.variantId, []);
		}
		priceOptMap.get(po.variantId)?.push({
			id: po.id,
			label: po.label,
			duration: po.duration,
			price: po.price,
			barcode: po.barcode,
			isActive: po.isActive,
		});
	}

	const map = new Map<string, VariantRow>();

	for (const row of raw) {
		if (!map.has(row.id)) {
			map.set(row.id, {
				id: row.id,
				decathlonSku: row.decathlonSku,
				totalStock: row.totalStock,
				shortestPrice: shortestOptionPrice(priceOptMap.get(row.id) ?? []),
				itemName: row.itemName,
				brand: row.brand,
				itemId: row.itemId,
				categoryName: row.categoryName,
				categoryId: row.categoryId,
				status: row.status,
				season: row.season,
				availableFrom: row.availableFrom,
				availableTo: row.availableTo,
				minDuration: row.minDuration,
				attributes: [],
				priceOptions: priceOptMap.get(row.id) ?? [],
			});
		}
		if (row.attributeName && row.attributeValue) {
			map.get(row.id)?.attributes.push({
				name: row.attributeName,
				value: row.attributeValue,
			});
		}
	}

	return Array.from(map.values());
}

export const getVariants = createServerFn({ method: "GET" }).handler(
	async () => {
		// Le garde est dans le handler, pas dans `loadVariants` : ce helper est aussi
		// appelé par `getReservableVariants`, qui a son propre contrôle. Le mettre ici
		// ferait porter le contrôle à un chemin qui a le sien.
		await requireDashboardSession();
		return loadVariants();
	},
);

const reservableVariantsSchema = z.object({
	pickupDate: z.string().datetime(),
	returnDate: z.string().datetime(),
});

export const getReservableVariants = createServerFn({ method: "GET" })
	.validator(reservableVariantsSchema.parse)
	.handler(
		async ({
			data,
		}): Promise<{
			isRentalOpen: boolean;
			variants: VariantRow[];
		}> => {
			await requireDashboardSession();
			const [settings, variants] = await Promise.all([
				getRentalSettingsRecord(),
				loadVariants(),
			]);
			const pickupDate = new Date(data.pickupDate);
			const returnDate = new Date(data.returnDate);
			return {
				isRentalOpen: settings.isRentalOpen,
				variants: variants
					.filter(
						(variant) =>
							evaluateItemAvailability({
								item: variant,
								settings,
								pickupDate,
								returnDate,
							}).available,
					)
					.map((variant) => ({
						...variant,
						priceOptions: variant.priceOptions.filter(
							(priceOption) => priceOption.isActive,
						),
					})),
			};
		},
	);

export type ItemImage = {
	id: string;
	url: string;
	alt: string | null;
	sortOrder: number;
};

export type ItemDetail = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	images: ItemImage[];
	brand: string;
	season: "winter" | "summer" | "all";
	decathlonUrl: string | null;
	categoryId: string;
	categoryName: string;
	availableFrom: string | null;
	availableTo: string | null;
	minDuration: number;
};

async function isItemSlugTaken(
	slug: string,
	excludeItemId?: string,
): Promise<boolean> {
	const rows = await db
		.select({ id: schema.items.id })
		.from(schema.items)
		.where(
			excludeItemId
				? and(eq(schema.items.slug, slug), ne(schema.items.id, excludeItemId))
				: eq(schema.items.slug, slug),
		);
	return rows.length > 0;
}

/** Slug d'URL unique, dérivé du slug saisi ou du nom du produit. */
async function resolveItemSlug(
	slug: string | undefined,
	name: string,
	excludeItemId?: string,
): Promise<string> {
	return makeUniqueSlug(slug?.trim() || name, (candidate) =>
		isItemSlugTaken(candidate, excludeItemId),
	);
}

export const getItem = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data }): Promise<ItemDetail | null> => {
		await requireDashboardSession();
		const [row] = await db
			.select({
				id: schema.items.id,
				name: schema.items.name,
				slug: schema.items.slug,
				description: schema.items.description,
				brand: schema.items.brand,
				season: schema.items.season,
				decathlonUrl: schema.items.decathlonUrl,
				categoryId: schema.items.categoryId,
				categoryName: schema.categories.name,
				availableFrom: schema.items.availableFrom,
				availableTo: schema.items.availableTo,
				minDuration: schema.items.minDuration,
			})
			.from(schema.items)
			.leftJoin(
				schema.categories,
				eq(schema.items.categoryId, schema.categories.id),
			)
			.where(eq(schema.items.id, data));

		if (!row) return null;

		const images = await db
			.select({
				id: schema.itemImages.id,
				url: schema.itemImages.url,
				alt: schema.itemImages.alt,
				sortOrder: schema.itemImages.sortOrder,
			})
			.from(schema.itemImages)
			.where(eq(schema.itemImages.itemId, data))
			.orderBy(schema.itemImages.sortOrder);

		return { ...row, categoryName: row.categoryName ?? "", images };
	});

export const getItemVariants = createServerFn({ method: "GET" })
	.validator((itemId: string) => itemId)
	.handler(async ({ data }): Promise<VariantRow[]> => {
		await requireDashboardSession();
		const raw = await db
			.select({
				id: schema.itemVariants.id,
				decathlonSku: schema.itemVariants.decathlonSku,
				totalStock: schema.itemVariants.totalStock,
				itemName: schema.items.name,
				brand: schema.items.brand,
				itemId: schema.items.id,
				categoryName: schema.categories.name,
				categoryId: schema.categories.id,
				status: schema.itemVariants.status,
				season: schema.items.season,
				availableFrom: schema.items.availableFrom,
				availableTo: schema.items.availableTo,
				minDuration: schema.items.minDuration,
				attributeName: schema.variantAttributes.name,
				attributeValue: schema.variantAttributes.value,
			})
			.from(schema.itemVariants)
			.innerJoin(schema.items, eq(schema.itemVariants.itemId, schema.items.id))
			.innerJoin(
				schema.categories,
				eq(schema.items.categoryId, schema.categories.id),
			)
			.leftJoin(
				schema.variantAttributes,
				eq(schema.itemVariants.id, schema.variantAttributes.variantId),
			)
			.where(eq(schema.itemVariants.itemId, data))
			.orderBy(asc(schema.items.name));

		const variantIds = [...new Set(raw.map((r) => r.id))];

		const priceOptRows =
			variantIds.length > 0
				? await db
						.select()
						.from(schema.priceOptions)
						.where(
							and(
								inArray(schema.priceOptions.variantId, variantIds),
								eq(schema.priceOptions.isActive, true),
							),
						)
				: [];

		const priceOptMap = new Map<string, PriceOptionRow[]>();
		for (const po of priceOptRows) {
			if (!priceOptMap.has(po.variantId)) {
				priceOptMap.set(po.variantId, []);
			}
			priceOptMap.get(po.variantId)?.push({
				id: po.id,
				label: po.label,
				duration: po.duration,
				price: po.price,
				barcode: po.barcode,
				isActive: po.isActive,
			});
		}

		const map = new Map<string, VariantRow>();

		for (const row of raw) {
			if (!map.has(row.id)) {
				map.set(row.id, {
					id: row.id,
					decathlonSku: row.decathlonSku,
					totalStock: row.totalStock,
					shortestPrice: shortestOptionPrice(priceOptMap.get(row.id) ?? []),
					itemName: row.itemName,
					brand: row.brand,
					itemId: row.itemId,
					categoryName: row.categoryName,
					categoryId: row.categoryId,
					status: row.status,
					season: row.season,
					availableFrom: row.availableFrom,
					availableTo: row.availableTo,
					minDuration: row.minDuration,
					attributes: [],
					priceOptions: priceOptMap.get(row.id) ?? [],
				});
			}
			if (row.attributeName && row.attributeValue) {
				map.get(row.id)?.attributes.push({
					name: row.attributeName,
					value: row.attributeValue,
				});
			}
		}

		return Array.from(map.values());
	});

const priceOptionSchema = z.object({
	label: z.string().min(1, "Le label est requis"),
	duration: z.coerce.number().int().min(1),
	price: z.coerce.number().min(0),
	barcode: z.string().min(1, "Le code-barres est requis"),
});

/** Prix de l'option la plus courte, pour les affichages en une ligne. */
function shortestOptionPrice(
	priceOptions: Array<{ duration: number; price: string }>,
): string | null {
	if (priceOptions.length === 0) return null;
	const sorted = [...priceOptions].sort((a, b) => a.duration - b.duration);
	return sorted[0]?.price ?? null;
}

const createVariantSchema = z
	.object({
		sku: z.string().optional(),
		totalStock: z.coerce.number().int().min(0),
		attributes: z.array(
			z.object({
				name: z.string().min(1),
				value: z.string().min(1),
			}),
		),
		priceOptions: z.array(priceOptionSchema).optional(),
	})
	.superRefine((v, ctx) => {
		// Un matériel sans aucune option de prix ne serait ni vendable en ligne
		// ni encodable en caisse : la variante n'existe pas utilisable.
		if (!v.priceOptions || v.priceOptions.length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["priceOptions"],
				message: "Au moins une option de prix est requise",
			});
		}
	});

const createItemSchema = z.object({
	name: z.string().min(1, "Le nom est requis"),
	slug: z.string().optional(),
	description: z.string().optional(),
	brand: z.string().min(1, "La marque est requise"),
	categoryId: z.string().min(1, "La catégorie est requise"),
	season: z.enum(["winter", "summer", "all"]),
	decathlonUrl: z.string().optional(),
	availableFrom: z.string().optional(),
	availableTo: z.string().optional(),
	minDuration: z.coerce.number().int().min(0).default(1),
	images: z
		.array(
			z.object({
				url: z.string().url("L'URL doit être valide"),
				alt: z.string().optional(),
			}),
		)
		.optional(),
	variants: z
		.array(createVariantSchema)
		.min(1, "Au moins une variante est requise"),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;

export const createItem = createServerFn({ method: "POST" })
	.validator(createItemSchema.parse)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		const [item] = await db
			.insert(schema.items)
			.values({
				name: data.name,
				slug: await resolveItemSlug(data.slug, data.name),
				description: data.description ?? null,
				brand: data.brand,
				categoryId: data.categoryId,
				season: data.season,
				decathlonUrl: data.decathlonUrl || null,
				availableFrom: data.availableFrom || null,
				availableTo: data.availableTo || null,
				minDuration: data.minDuration,
			})
			.returning();

		if (data.images && data.images.length > 0) {
			await db.insert(schema.itemImages).values(
				data.images.map((img, i) => ({
					itemId: item.id,
					url: img.url,
					alt: img.alt ?? null,
					sortOrder: i,
				})),
			);
		}

		for (const variant of data.variants) {
			const [insertedVariant] = await db
				.insert(schema.itemVariants)
				.values({
					itemId: item.id,
					decathlonSku: variant.sku || null,
					totalStock: variant.totalStock,
				})
				.returning();

			if (variant.attributes.length > 0) {
				await db.insert(schema.variantAttributes).values(
					variant.attributes.map((attr) => ({
						variantId: insertedVariant.id,
						name: attr.name,
						value: attr.value,
					})),
				);
			}

			if (variant.priceOptions && variant.priceOptions.length > 0) {
				try {
					await db.insert(schema.priceOptions).values(
						variant.priceOptions.map((opt) => ({
							variantId: insertedVariant.id,
							label: opt.label,
							duration: opt.duration,
							price: String(opt.price.toFixed(2)),
							barcode: opt.barcode,
						})),
					);
				} catch (err: unknown) {
					const cause = err as { cause?: { code?: string } };
					if (cause?.cause?.code === "23505") {
						throw new Error("Ce code-barres existe déjà");
					}
					throw err;
				}
			}
		}

		return item;
	});

const updateItemPriceOptionSchema = z.object({
	id: z.string().optional(),
	label: z.string().min(1, "Le label est requis"),
	duration: z.coerce.number().int().min(1),
	price: z.coerce.number().min(0),
	barcode: z.string().min(1, "Le code-barres est requis"),
});

const updateVariantSchema = z
	.object({
		id: z.string().optional(),
		sku: z.string().optional(),
		totalStock: z.coerce.number().int().min(0),
		attributes: z.array(
			z.object({
				name: z.string().min(1),
				value: z.string().min(1),
			}),
		),
		priceOptions: z.array(updateItemPriceOptionSchema).optional(),
	})
	.superRefine((v, ctx) => {
		// Un matériel sans aucune option de prix ne serait ni vendable en ligne
		// ni encodable en caisse : la variante n'existe pas utilisable.
		if (!v.priceOptions || v.priceOptions.length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["priceOptions"],
				message: "Au moins une option de prix est requise",
			});
		}
	});

const updateItemSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1, "Le nom est requis"),
	slug: z.string().optional(),
	description: z.string().optional(),
	brand: z.string().min(1, "La marque est requise"),
	categoryId: z.string().min(1, "La catégorie est requise"),
	season: z.enum(["winter", "summer", "all"]),
	decathlonUrl: z.string().optional(),
	availableFrom: z.string().optional(),
	availableTo: z.string().optional(),
	minDuration: z.coerce.number().int().min(0).default(1),
	images: z
		.array(
			z.object({
				id: z.string().optional(),
				url: z.string().url("L'URL doit être valide"),
				alt: z.string().optional(),
			}),
		)
		.optional(),
	variants: z
		.array(updateVariantSchema)
		.min(1, "Au moins une variante est requise"),
});

export const updateItem = createServerFn({ method: "POST" })
	.validator(updateItemSchema.parse)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		await db
			.update(schema.items)
			.set({
				name: data.name,
				slug: await resolveItemSlug(data.slug, data.name, data.id),
				description: data.description ?? null,
				brand: data.brand,
				categoryId: data.categoryId,
				season: data.season,
				decathlonUrl: data.decathlonUrl || null,
				availableFrom: data.availableFrom || null,
				availableTo: data.availableTo || null,
				minDuration: data.minDuration,
			})
			.where(eq(schema.items.id, data.id));

		const existingRows = await db
			.select({ id: schema.itemVariants.id })
			.from(schema.itemVariants)
			.where(eq(schema.itemVariants.itemId, data.id));

		const existingIds = new Set(existingRows.map((r) => r.id));
		const variantsWithIds = data.variants.filter((v) => !!v.id);
		const submittedIds = new Set(variantsWithIds.map((v) => v.id as string));

		for (const id of existingIds) {
			if (!submittedIds.has(id)) {
				await db
					.delete(schema.variantAttributes)
					.where(eq(schema.variantAttributes.variantId, id));
				await db
					.delete(schema.itemVariants)
					.where(eq(schema.itemVariants.id, id));
			}
		}

		for (const variant of data.variants) {
			if (variant.id && existingIds.has(variant.id)) {
				const options = variant.priceOptions ?? [];
				await db
					.update(schema.itemVariants)
					.set({
						decathlonSku: variant.sku || null,
						totalStock: variant.totalStock,
					})
					.where(eq(schema.itemVariants.id, variant.id));

				await db
					.delete(schema.variantAttributes)
					.where(eq(schema.variantAttributes.variantId, variant.id));

				if (variant.attributes.length > 0) {
					await db.insert(schema.variantAttributes).values(
						variant.attributes.map((attr) => ({
							variantId: variant.id as string,
							name: attr.name,
							value: attr.value,
						})),
					);
				}

				// Les options archivées ne sont pas soumises par le formulaire — elles
				// ne lui sont même pas renvoyées — et ne doivent pas non plus entrer
				// dans la comparaison : elles seraient supprimées en dur, alors que
				// `reservation_items` continue de les référencer.
				const existingOpts = await db
					.select({ id: schema.priceOptions.id })
					.from(schema.priceOptions)
					.where(
						and(
							eq(schema.priceOptions.variantId, variant.id),
							eq(schema.priceOptions.isActive, true),
						),
					);

				const submittedOptIds = new Set(
					options.filter((o) => !!o.id).map((o) => o.id as string),
				);

				for (const opt of existingOpts) {
					if (!submittedOptIds.has(opt.id)) {
						await db
							.delete(schema.priceOptions)
							.where(eq(schema.priceOptions.id, opt.id));
					}
				}

				for (const opt of options) {
					if (opt.id && submittedOptIds.has(opt.id)) {
						await db
							.update(schema.priceOptions)
							.set({
								label: opt.label,
								duration: opt.duration,
								price: String(opt.price.toFixed(2)),
								barcode: opt.barcode || undefined,
							})
							.where(eq(schema.priceOptions.id, opt.id));
					} else {
						try {
							await db.insert(schema.priceOptions).values({
								variantId: variant.id,
								label: opt.label,
								duration: opt.duration,
								price: String(opt.price.toFixed(2)),
								barcode: opt.barcode,
							});
						} catch (err: unknown) {
							const cause = err as { cause?: { code?: string } };
							if (cause?.cause?.code === "23505") {
								throw new Error("Ce code-barres existe déjà");
							}
							throw err;
						}
					}
				}
			} else {
				const options = variant.priceOptions ?? [];
				const [inserted] = await db
					.insert(schema.itemVariants)
					.values({
						itemId: data.id,
						decathlonSku: variant.sku || null,
						totalStock: variant.totalStock,
					})
					.returning();

				if (variant.attributes.length > 0) {
					await db.insert(schema.variantAttributes).values(
						variant.attributes.map((attr) => ({
							variantId: inserted.id,
							name: attr.name,
							value: attr.value,
						})),
					);
				}

				if (options.length > 0) {
					try {
						await db.insert(schema.priceOptions).values(
							options.map((opt) => ({
								variantId: inserted.id,
								label: opt.label,
								duration: opt.duration,
								price: String(opt.price.toFixed(2)),
								barcode: opt.barcode,
							})),
						);
					} catch (err: unknown) {
						const cause = err as { cause?: { code?: string } };
						if (cause?.cause?.code === "23505") {
							throw new Error("Ce code-barres existe déjà");
						}
						throw err;
					}
				}
			}
		}

		if (data.images) {
			const existingImages = await db
				.select({ id: schema.itemImages.id })
				.from(schema.itemImages)
				.where(eq(schema.itemImages.itemId, data.id));

			const existingImageIds = new Set(existingImages.map((r) => r.id));
			const imagesWithIds = data.images.filter((img) => !!img.id);
			const submittedImageIds = new Set(
				imagesWithIds.map((img) => img.id as string),
			);

			for (const id of existingImageIds) {
				if (!submittedImageIds.has(id)) {
					await db
						.delete(schema.itemImages)
						.where(eq(schema.itemImages.id, id));
				}
			}

			for (const [i, img] of data.images.entries()) {
				if (img.id && existingImageIds.has(img.id)) {
					await db
						.update(schema.itemImages)
						.set({ url: img.url, alt: img.alt ?? null, sortOrder: i })
						.where(eq(schema.itemImages.id, img.id));
				} else {
					await db.insert(schema.itemImages).values({
						itemId: data.id,
						url: img.url,
						alt: img.alt ?? null,
						sortOrder: i,
					});
				}
			}
		}

		return { success: true };
	});

async function variantIdsOfItem(itemId: string): Promise<string[]> {
	return (
		await db
			.select({ id: schema.itemVariants.id })
			.from(schema.itemVariants)
			.where(eq(schema.itemVariants.itemId, itemId))
	).map((row) => row.id);
}

const itemIdSchema = z.string().min(1);

/**
 * Sort définitivement un article du catalogue public : toutes ses variantes
 * passent en `RETIRED`. L'historique des réservations et les statistiques
 * restent intacts (rien n'est supprimé en base).
 *
 * Bloqué tant qu'une réservation en cours consomme l'une des variantes : le
 * retrait n'a de sens que sur un matériel rendu, jamais au milieu d'une
 * location active.
 */
export const retireItem = createServerFn({ method: "POST" })
	.validator((itemId: string) => itemIdSchema.parse(itemId))
	.handler(async ({ data: itemId }) => {
		await requireDashboardSession();
		const variantIds = await variantIdsOfItem(itemId);
		if (variantIds.length === 0) {
			throw new Error("Article introuvable.");
		}

		const activeLines = await db
			.select({ variantId: schema.reservationItems.variantId })
			.from(schema.reservationItems)
			.innerJoin(
				schema.reservations,
				eq(schema.reservationItems.reservationId, schema.reservations.id),
			)
			.where(
				and(
					inArray(schema.reservationItems.variantId, variantIds),
					inArray(schema.reservations.status, [...STOCK_CONSUMING_STATUSES]),
				),
			);

		if (activeLines.length > 0) {
			throw new Error(
				"Location en cours : il reste des réservations actives sur cet article.",
			);
		}

		await db
			.update(schema.itemVariants)
			.set({ status: "RETIRED" })
			.where(inArray(schema.itemVariants.id, variantIds));

		return { success: true };
	});

/**
 * Remet en location un article retiré. Simplification assumée : les variantes
 * passent toutes en `AVAILABLE`, même celles qui étaient encore en maintenance
 * au moment du retrait.
 */
export const reactivateItem = createServerFn({ method: "POST" })
	.validator((itemId: string) => itemIdSchema.parse(itemId))
	.handler(async ({ data: itemId }) => {
		await requireDashboardSession();
		const variantIds = await variantIdsOfItem(itemId);
		if (variantIds.length === 0) {
			throw new Error("Article introuvable.");
		}

		await db
			.update(schema.itemVariants)
			.set({ status: "AVAILABLE" })
			.where(inArray(schema.itemVariants.id, variantIds));

		return { success: true };
	});
