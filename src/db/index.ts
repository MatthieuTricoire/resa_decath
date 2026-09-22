// app/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "#/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
	conn: postgres.Sql | undefined;
};

// Lecture robuste de l'URL au runtime
const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;

if (!connectionString) {
	throw new Error("CRITICAL: DATABASE_URL is missing or empty at runtime!");
}

// Neon impose SSL et préfère max: 1 en environnement Serverless
const conn =
	globalForDb.conn ??
	postgres(connectionString, {
		ssl: "require",
		max: 1, // Recommandé pour éviter d'épuiser le pooler Neon sur les fonctions serverless
	});

if (env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle({ client: conn, schema });
