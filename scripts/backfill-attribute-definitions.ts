import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../src/db/schema";

const connectionString =
	process.env.DATABASE_URL ||
	"postgresql://postgres:@localhost:5432/ResaMountain";
const pool = new pg.Pool({ connectionString });
const db = drizzle(pool, { schema });

async function main() {
	// Déduplication des noms d'attributs déjà saisis dans les variantes.
	const nameRows = await db
		.selectDistinct({ name: schema.variantAttributes.name })
		.from(schema.variantAttributes);

	const existing = await db
		.select({ name: schema.attributeDefinitions.name })
		.from(schema.attributeDefinitions);
	const existingNames = new Set(existing.map((d) => d.name));

	const namesToCreate = nameRows
		.map((row) => row.name)
		.filter((name) => !existingNames.has(name));

	let sortOrder = existing.length;
	for (const name of namesToCreate) {
		const [created] = await db
			.insert(schema.attributeDefinitions)
			.values({ name, sortOrder: sortOrder++ })
			.returning({ id: schema.attributeDefinitions.id });

		const valueRows = await db
			.selectDistinct({ value: schema.variantAttributes.value })
			.from(schema.variantAttributes)
			.where(eq(schema.variantAttributes.name, name));

		for (const [index, value] of valueRows.entries()) {
			await db
				.insert(schema.attributeValues)
				.values({ definitionId: created.id, value: value.value, sortOrder: index });
		}
		console.log(`✓ « ${name} » : ${valueRows.length} valeur(s) ajoutée(s)`);
	}

	if (namesToCreate.length === 0) {
		console.log("Aucun nouvel attribut à créer (données déjà à jour).");
	} else {
		console.log(`Terminé : ${namesToCreate.length} attribut(s) créé(s).`);
	}

	await pool.end();
}

main().catch(async (error) => {
	console.error(error);
	await pool.end();
	process.exit(1);
});