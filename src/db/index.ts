// app/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "#/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
	conn: postgres.Sql | undefined;
};

// Récupération et nettoyage strict de la chaîne de connexion
const rawUrl = process.env.DATABASE_URL || env?.DATABASE_URL || "";
const connectionString = rawUrl.trim().replace(/^["']|["']$/g, "");

if (!connectionString || connectionString.length === 0) {
	console.error(
		"🚨 DATABASE_URL est vide ou absente dans l'environnement de la fonction Netlify !",
	);
	throw new Error("CRITICAL: DATABASE_URL is missing or empty at runtime!");
}

// Vérification préventive pour intercepter l'erreur avant postgres.js
try {
	new URL(connectionString);
} catch (err) {
	console.error(
		"🚨 La chaîne DATABASE_URL n'est pas une URL valide :",
		connectionString.slice(0, 15) + "...",
	);
	throw new Error(
		"CRITICAL: DATABASE_URL is not a valid URL for Node.js URL parser!",
	);
}

// Instanciation adaptée à Neon et aux fonctions Serverless
const conn =
	globalForDb.conn ??
	postgres(connectionString, {
		ssl: "require",
		max: 1,
	});

if (env?.NODE_ENV !== "production") {
	globalForDb.conn = conn;
}

export const db = drizzle({ client: conn, schema });
