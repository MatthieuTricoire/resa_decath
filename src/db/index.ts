// app/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "#/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
	conn: postgres.Sql | undefined;
};

const rawUrl = (process.env.DATABASE_URL || env?.DATABASE_URL || "")
	.trim()
	.replace(/^["']|["']$/g, "");

if (!rawUrl) {
	throw new Error("CRITICAL: DATABASE_URL is missing or empty at runtime!");
}

// Activer le SSL uniquement pour Neon / serveurs distants, pas pour localhost
const isLocalhost =
	rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1");
const sslConfig = isLocalhost ? false : "require";

const match = rawUrl.match(
	/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^/:]+)(?::(\d+))?\/([^?]+)(?:\?.*)?$/,
);

let conn: postgres.Sql;

if (match) {
	const [, user, password, host, port, database] = match;
	conn =
		globalForDb.conn ??
		postgres({
			host,
			port: port ? Number.parseInt(port, 10) : 5432,
			database,
			user,
			pass: decodeURIComponent(password),
			ssl: sslConfig,
			max: 1,
		});
} else {
	conn =
		globalForDb.conn ??
		postgres(rawUrl, {
			ssl: sslConfig,
			max: 1,
		});
}

if (env?.NODE_ENV !== "production") {
	globalForDb.conn = conn;
}

export const db = drizzle({ client: conn, schema });
