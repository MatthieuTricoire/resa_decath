import { createServerFn } from "@tanstack/react-start";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";

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

export type PaymentMode = "per_day" | "per_duration";

export type VariantRow = {
	id: string;
	decathlonSku: string | null;
	totalStock: number;
	pricingMode: PaymentMode;
	dailyPrice: string;
	itemName: string;
	brand: string;
	itemId: string;
	categoryName: string;
	categoryId: string;
	status: string;
	attributes: VariantAttribute[];
	priceOptions: PriceOptionRow[];
};

export const getCategories = createServerFn({ method: "GET" }).handler(
	async () => {
		const categories = await db
			.select()
			.from(schema.categories)
			.orderBy(schema.categories.name);
		return categories;
	},
);

export const deleteCategory = createServerFn({ method: "POST" })
	.inputValidator((id: string) => id)
	.handler(async ({ data }) => {
		await db.delete(schema.categories).where(eq(schema.categories.id, data));
	});

export const updateCategory = createServerFn({ method: "POST" })
	.inputValidator((input: { id: string; name: string }) => input)
	.handler(async ({ data }) => {
		const slug = data.name
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
		await db
			.update(schema.categories)
			.set({ name: data.name, slug })
			.where(eq(schema.categories.id, data.id));
	});

export const getVariants = createServerFn({ method: "GET" }).handler(
	async (): Promise<VariantRow[]> => {
		const raw = await db
			.select({
				id: schema.itemVariants.id,
				decathlonSku: schema.itemVariants.decathlonSku,
				totalStock: schema.itemVariants.totalStock,
				pricingMode: schema.itemVariants.pricingMode,
				dailyPrice: schema.itemVariants.dailyPrice,
				itemName: schema.items.name,
				brand: schema.items.brand,
				itemId: schema.items.id,
				categoryName: schema.categories.name,
				categoryId: schema.categories.id,
				status: schema.itemVariants.status,
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
						.where(inArray(schema.priceOptions.variantId, uniqueIds))
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
					pricingMode: row.pricingMode,
					dailyPrice: row.dailyPrice,
					itemName: row.itemName,
					brand: row.brand,
					itemId: row.itemId,
					categoryName: row.categoryName,
					categoryId: row.categoryId,
					status: row.status,
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
	minDurationUnit: "half_day" | "day";
};

export const getItem = createServerFn({ method: "GET" })
	.inputValidator((id: string) => id)
	.handler(async ({ data }): Promise<ItemDetail | null> => {
		const [row] = await db
			.select({
				id: schema.items.id,
				name: schema.items.name,
				description: schema.items.description,
				brand: schema.items.brand,
				season: schema.items.season,
				decathlonUrl: schema.items.decathlonUrl,
				categoryId: schema.items.categoryId,
				categoryName: schema.categories.name,
				availableFrom: schema.items.availableFrom,
				availableTo: schema.items.availableTo,
				minDuration: schema.items.minDuration,
				minDurationUnit: schema.items.minDurationUnit,
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
	.inputValidator((itemId: string) => itemId)
	.handler(async ({ data }): Promise<VariantRow[]> => {
		const raw = await db
			.select({
				id: schema.itemVariants.id,
				decathlonSku: schema.itemVariants.decathlonSku,
				totalStock: schema.itemVariants.totalStock,
				pricingMode: schema.itemVariants.pricingMode,
				dailyPrice: schema.itemVariants.dailyPrice,
				itemName: schema.items.name,
				brand: schema.items.brand,
				itemId: schema.items.id,
				categoryName: schema.categories.name,
				categoryId: schema.categories.id,
				status: schema.itemVariants.status,
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
						.where(inArray(schema.priceOptions.variantId, variantIds))
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
					pricingMode: row.pricingMode,
					dailyPrice: row.dailyPrice,
					itemName: row.itemName,
					brand: row.brand,
					itemId: row.itemId,
					categoryName: row.categoryName,
					categoryId: row.categoryId,
					status: row.status,
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

const durationUnitSchema = z.enum(["half_day", "day"]);
const pricingModeSchema = z.enum(["per_day", "per_duration"]);

const priceOptionSchema = z.object({
	label: z.string().min(1, "Le label est requis"),
	duration: z.coerce.number().int().min(1),
	price: z.coerce.number().min(0),
	barcode: z.string().min(1, "Le code-barres est requis"),
});

// En mode "per_duration", le prix journalier est dérivé de l'option la plus courte.
// En mode "per_day", c'est le prix saisi qui fait foi.
function deriveDailyPrice(variant: {
	pricingMode: PaymentMode;
	dailyPrice?: number;
	priceOptions?: Array<{ duration: number; price: number }>;
}): string {
	if (variant.pricingMode === "per_duration") {
		const sorted = [...(variant.priceOptions ?? [])].sort(
			(a, b) => a.duration - b.duration,
		);
		return (sorted[0]?.price ?? 0).toFixed(2);
	}
	return (variant.dailyPrice ?? 0).toFixed(2);
}

const createVariantSchema = z
	.object({
		sku: z.string().optional(),
		totalStock: z.coerce.number().int().min(0),
		pricingMode: pricingModeSchema.default("per_day"),
		dailyPrice: z.coerce.number().min(0).optional(),
		attributes: z.array(
			z.object({
				name: z.string().min(1),
				value: z.string().min(1),
			}),
		),
		priceOptions: z.array(priceOptionSchema).optional(),
	})
	.superRefine((v, ctx) => {
		if (v.pricingMode === "per_duration") {
			if (!v.priceOptions || v.priceOptions.length === 0) {
				ctx.addIssue({
					code: "custom",
					path: ["priceOptions"],
					message:
						"Au moins une option de prix est requise en mode « tarifs par durée »",
				});
			}
		} else if (v.dailyPrice === undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["dailyPrice"],
				message: "Le prix journalier est requis en mode « prix à la journée »",
			});
		}
	});

const createItemSchema = z.object({
	name: z.string().min(1, "Le nom est requis"),
	description: z.string().optional(),
	brand: z.string().min(1, "La marque est requise"),
	categoryId: z.string().min(1, "La catégorie est requise"),
	season: z.enum(["winter", "summer", "all"]),
	decathlonUrl: z.string().optional(),
	availableFrom: z.string().optional(),
	availableTo: z.string().optional(),
	minDuration: z.coerce.number().int().min(0).default(1),
	minDurationUnit: durationUnitSchema.default("half_day"),
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
	.inputValidator(createItemSchema.parse)
	.handler(async ({ data }) => {
		const [item] = await db
			.insert(schema.items)
			.values({
				name: data.name,
				description: data.description ?? null,
				brand: data.brand,
				categoryId: data.categoryId,
				season: data.season,
				decathlonUrl: data.decathlonUrl || null,
				availableFrom: data.availableFrom || null,
				availableTo: data.availableTo || null,
				minDuration: data.minDuration,
				minDurationUnit: data.minDurationUnit,
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
					pricingMode: variant.pricingMode,
					dailyPrice: deriveDailyPrice(variant),
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
		pricingMode: pricingModeSchema.default("per_day"),
		dailyPrice: z.coerce.number().min(0).optional(),
		attributes: z.array(
			z.object({
				name: z.string().min(1),
				value: z.string().min(1),
			}),
		),
		priceOptions: z.array(updateItemPriceOptionSchema).optional(),
	})
	.superRefine((v, ctx) => {
		if (v.pricingMode === "per_duration") {
			if (!v.priceOptions || v.priceOptions.length === 0) {
				ctx.addIssue({
					code: "custom",
					path: ["priceOptions"],
					message:
						"Au moins une option de prix est requise en mode « tarifs par durée »",
				});
			}
		} else if (v.dailyPrice === undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["dailyPrice"],
				message: "Le prix journalier est requis en mode « prix à la journée »",
			});
		}
	});

const updateItemSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1, "Le nom est requis"),
	description: z.string().optional(),
	brand: z.string().min(1, "La marque est requise"),
	categoryId: z.string().min(1, "La catégorie est requise"),
	season: z.enum(["winter", "summer", "all"]),
	decathlonUrl: z.string().optional(),
	availableFrom: z.string().optional(),
	availableTo: z.string().optional(),
	minDuration: z.coerce.number().int().min(0).default(1),
	minDurationUnit: durationUnitSchema.default("half_day"),
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
	.inputValidator(updateItemSchema.parse)
	.handler(async ({ data }) => {
		await db
			.update(schema.items)
			.set({
				name: data.name,
				description: data.description ?? null,
				brand: data.brand,
				categoryId: data.categoryId,
				season: data.season,
				decathlonUrl: data.decathlonUrl || null,
				availableFrom: data.availableFrom || null,
				availableTo: data.availableTo || null,
				minDuration: data.minDuration,
				minDurationUnit: data.minDurationUnit,
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
						pricingMode: variant.pricingMode,
						dailyPrice: deriveDailyPrice(variant),
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

				const existingOpts = await db
					.select({ id: schema.priceOptions.id })
					.from(schema.priceOptions)
					.where(eq(schema.priceOptions.variantId, variant.id));

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
						pricingMode: variant.pricingMode,
						dailyPrice: deriveDailyPrice(variant),
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
