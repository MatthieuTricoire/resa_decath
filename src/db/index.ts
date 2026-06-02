// app/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "#/env";
import * as schema from "./schema";

// 1. Éviter de saturer les connexions à la DB en mode développement (HMR)
const globalForDb = globalThis as unknown as {
	conn: postgres.Sql | undefined;
};

// 2. Initialisation du client de connexion postgres.js
const conn = globalForDb.conn ?? postgres(env.DATABASE_URL);
if (env.NODE_ENV !== "production") globalForDb.conn = conn;

// 3. Export de l'instance Drizzle configurée avec ton schéma
export const db = drizzle({ client: conn, schema });
