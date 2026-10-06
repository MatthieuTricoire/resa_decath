import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { requireDashboardSession } from "#/features/auth/queries";

export type AttributeValueRow = {
	id: string;
	value: string;
	sortOrder: number;
	/** Nombre de variantes qui affichent cette valeur. */
	usageCount: number;
};

export type AttributeDefinitionRow = {
	id: string;
	name: string;
	sortOrder: number;
	/** Nombre de lignes `variant_attributes` qui portent ce nom. */
	usageCount: number;
	values: AttributeValueRow[];
};

export const getAttributeDefinitions = createServerFn({
	method: "GET",
}).handler(async (): Promise<AttributeDefinitionRow[]> => {
	await requireDashboardSession();

	const defs = await db
		.select({
			id: schema.attributeDefinitions.id,
			name: schema.attributeDefinitions.name,
			sortOrder: schema.attributeDefinitions.sortOrder,
			valueId: schema.attributeValues.id,
			value: schema.attributeValues.value,
			valueSortOrder: schema.attributeValues.sortOrder,
		})
		.from(schema.attributeDefinitions)
		.leftJoin(
			schema.attributeValues,
			eq(schema.attributeValues.definitionId, schema.attributeDefinitions.id),
		)
		.orderBy(
			asc(schema.attributeDefinitions.sortOrder),
			asc(schema.attributeValues.sortOrder),
		);

	const orderedNames = [...new Set(defs.map((d) => d.name))];
	const orderedIds = [...new Set(defs.map((d) => d.id))];

	const variantRows =
		orderedNames.length > 0
			? await db
					.select({
						name: schema.variantAttributes.name,
						value: schema.variantAttributes.value,
					})
					.from(schema.variantAttributes)
					.where(inArray(schema.variantAttributes.name, orderedNames))
			: [];

	const usageByName = new Map<string, number>();
	for (const row of variantRows) {
		usageByName.set(row.name, (usageByName.get(row.name) ?? 0) + 1);
	}
	const usageByValue = new Map<string, number>();
	for (const row of variantRows) {
		const key = `${row.name}\u0000${row.value}`;
		usageByValue.set(key, (usageByValue.get(key) ?? 0) + 1);
	}

	const map = new Map<string, AttributeDefinitionRow>();
	for (const row of defs) {
		if (!map.has(row.id)) {
			map.set(row.id, {
				id: row.id,
				name: row.name,
				sortOrder: row.sortOrder,
				usageCount: usageByName.get(row.name) ?? 0,
				values: [],
			});
		}
		if (row.valueId && row.value !== null) {
			map.get(row.id)?.values.push({
				id: row.valueId,
				value: row.value,
				sortOrder: row.valueSortOrder ?? 0,
				usageCount: usageByValue.get(`${row.name}\u0000${row.value}`) ?? 0,
			});
		}
	}

	return orderedIds
		.map((id) => map.get(id))
		.filter((d): d is AttributeDefinitionRow => !!d);
});

const definitionNameSchema = z.object({
	name: z.string().trim().min(1, "Le nom est requis"),
});

const duplicateError = (message: string) => (err: unknown) => {
	const cause = err as { cause?: { code?: string } };
	if (cause?.cause?.code === "23505") throw new Error(message);
	throw err;
};

export const createAttributeDefinition = createServerFn({ method: "POST" })
	.validator(definitionNameSchema.parse)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		try {
			return await db.transaction(async (tx) => {
				const [{ maxOrder }] = await tx
					.select({ maxOrder: max(schema.attributeDefinitions.sortOrder) })
					.from(schema.attributeDefinitions);
				const [created] = await tx
					.insert(schema.attributeDefinitions)
					.values({
						name: data.name,
						sortOrder: (maxOrder ?? 0) + 1,
					})
					.returning();
				return created;
			});
		} catch (err: unknown) {
			throw duplicateError(`L'attribut « ${data.name} » existe déjà`)(err);
		}
	});

export const updateAttributeDefinition = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().min(1) }).merge(definitionNameSchema))
	.handler(async ({ data }) => {
		await requireDashboardSession();
		try {
			await db.transaction(async (tx) => {
				const [existing] = await tx
					.select({ name: schema.attributeDefinitions.name })
					.from(schema.attributeDefinitions)
					.where(eq(schema.attributeDefinitions.id, data.id));
				if (!existing) throw new Error("Attribut introuvable");

				if (existing.name === data.name) return;

				// Le renommage se propage aux variantes existantes pour garder une
				// saisie cohérente partout.
				await tx
					.update(schema.variantAttributes)
					.set({ name: data.name })
					.where(eq(schema.variantAttributes.name, existing.name));

				await tx
					.update(schema.attributeDefinitions)
					.set({ name: data.name })
					.where(eq(schema.attributeDefinitions.id, data.id));
			});
		} catch (err: unknown) {
			throw duplicateError(`L'attribut « ${data.name} » existe déjà`)(err);
		}
	});

export const deleteAttributeDefinition = createServerFn({ method: "POST" })
	.validator((id: string) => id)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		await db.transaction(async (tx) => {
			const [existing] = await tx
				.select({ id: schema.attributeDefinitions.id })
				.from(schema.attributeDefinitions)
				.where(eq(schema.attributeDefinitions.id, data));
			if (!existing) throw new Error("Attribut introuvable");

			// `variant_attributes` est un instantané texte : supprimer la
			// définition ne touche pas aux fiches existantes. Elle sort juste de
			// la liste proposée à la saisie, l'admin ayant confirmé cet effet.
			await tx
				.delete(schema.attributeDefinitions)
				.where(eq(schema.attributeDefinitions.id, data));
		});
	});

export const setAttributeDefinitionOrder = createServerFn({ method: "POST" })
	.validator(
		z.array(z.object({ id: z.string().min(1), sortOrder: z.number().int() })),
	)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		await db.transaction(async (tx) => {
			for (const entry of data) {
				await tx
					.update(schema.attributeDefinitions)
					.set({ sortOrder: entry.sortOrder })
					.where(eq(schema.attributeDefinitions.id, entry.id));
			}
		});
	});

const attributeValueSchema = z.object({
	definitionId: z.string().min(1),
	value: z.string().trim().min(1, "La valeur est requise"),
});

export const createAttributeValue = createServerFn({ method: "POST" })
	.validator(attributeValueSchema.parse)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		try {
			await db.transaction(async (tx) => {
				const [definition] = await tx
					.select({ name: schema.attributeDefinitions.name })
					.from(schema.attributeDefinitions)
					.where(eq(schema.attributeDefinitions.id, data.definitionId));
				if (!definition) throw new Error("Attribut introuvable");

				const [{ maxOrder }] = await tx
					.select({ maxOrder: max(schema.attributeValues.sortOrder) })
					.from(schema.attributeValues)
					.where(eq(schema.attributeValues.definitionId, data.definitionId));

				await tx.insert(schema.attributeValues).values({
					definitionId: data.definitionId,
					value: data.value,
					sortOrder: (maxOrder ?? 0) + 1,
				});
			});
		} catch (err: unknown) {
			throw duplicateError(`La valeur « ${data.value} » existe déjà`)(err);
		}
	});

export const updateAttributeValue = createServerFn({ method: "POST" })
	.validator(
		z.object({ id: z.string().min(1) }).merge(
			z.object({
				value: z.string().trim().min(1, "La valeur est requise"),
			}),
		),
	)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		try {
			await db.transaction(async (tx) => {
				const [existing] = await tx
					.select({
						id: schema.attributeValues.id,
						value: schema.attributeValues.value,
						definitionId: schema.attributeValues.definitionId,
					})
					.from(schema.attributeValues)
					.where(eq(schema.attributeValues.id, data.id));
				if (!existing) throw new Error("Valeur introuvable");

				if (existing.value === data.value) return;

				const [definition] = await tx
					.select({ name: schema.attributeDefinitions.name })
					.from(schema.attributeDefinitions)
					.where(eq(schema.attributeDefinitions.id, existing.definitionId));
				if (!definition) throw new Error("Attribut introuvable");

				// Propagation aux variantes existantes.
				await tx
					.update(schema.variantAttributes)
					.set({ value: data.value })
					.where(
						and(
							eq(schema.variantAttributes.name, definition.name),
							eq(schema.variantAttributes.value, existing.value),
						),
					);

				await tx
					.update(schema.attributeValues)
					.set({ value: data.value })
					.where(eq(schema.attributeValues.id, data.id));
			});
		} catch (err: unknown) {
			throw duplicateError(`La valeur « ${data.value} » existe déjà`)(err);
		}
	});

export const deleteAttributeValue = createServerFn({ method: "POST" })
	.validator((id: string) => id)
	.handler(async ({ data }) => {
		await requireDashboardSession();
		await db.transaction(async (tx) => {
			const [existing] = await tx
				.select({ id: schema.attributeValues.id })
				.from(schema.attributeValues)
				.where(eq(schema.attributeValues.id, data));
			if (!existing) throw new Error("Valeur introuvable");

			// Idem `deleteAttributeDefinition` : les fiches existantes gardent
			// leur valeur en texte, elle n'est simplement plus proposée à l'ajout.
			await tx
				.delete(schema.attributeValues)
				.where(eq(schema.attributeValues.id, data));
		});
	});
