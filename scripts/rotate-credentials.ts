import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../src/db/schema";

/**
 * Rotation one-shot des mots de passe admin/gérant.
 *
 * Usage, depuis la machine qui a accès à la base de prod :
 *   ADMIN_PASSWORD="..." MANAGER_PASSWORD="..." npm run db:rotate-credentials
 * (ou les deux variables posées dans .env.local — jamais dans le code).
 *
 * Règles :
 * - Aucun secret dans le dépôt : les deux valeurs viennent de l'environnement
 *   et chaque exécution les dérive en hash scrypt via hashPassword, le même
 *   fournisseur que le seed et que better-auth.
 * - Ne touche qu'aux lignes `account` de provider `credential` rattachées à
 *   un `user` de rôle `admin` ou `manager` : les comptes clients et les
 *   comptes par lien magique (sans mot de passe) ne sont jamais modifiés.
 * - Les sessions déjà ouvertes ne sont pas révoquées : penser à signaler le
 *   changement (ou à révoquer depuis /admin/compte).
 */

const connectionString =
	process.env.DATABASE_URL ||
	"postgresql://postgres:@localhost:5432/ResaMountain";
const pool = new pg.Pool({ connectionString });
const db = drizzle(pool, { schema });

async function main() {
	const adminPassword = process.env.ADMIN_PASSWORD;
	const managerPassword = process.env.MANAGER_PASSWORD;

	if (!adminPassword || !managerPassword) {
		console.error(
			"❌ ADMIN_PASSWORD et MANAGER_PASSWORD doivent être définis (ex. dans .env.local).",
		);
		console.error("   Exemple : ADMIN_PASSWORD=\"$(openssl rand -base64 24)\" ...");
		process.exit(1);
	}

	console.log("⏳ Rotation des mots de passe admin/gérant...");

	const [adminHash, managerHash] = await Promise.all([
		hashPassword(adminPassword),
		hashPassword(managerPassword),
	]);

	const credentialAccounts = await db
		.select({
			accountId: schema.account.id,
			userId: schema.user.id,
			email: schema.user.email,
			role: schema.user.role,
		})
		.from(schema.account)
		.innerJoin(schema.user, eq(schema.user.id, schema.account.userId))
		.where(eq(schema.account.providerId, "credential"));

	const admins = credentialAccounts.filter((account) => account.role === "admin");
	const managers = credentialAccounts.filter(
		(account) => account.role === "manager",
	);

	if (admins.length === 0 && managers.length === 0) {
		console.error(
			"❌ Aucun compte admin/gérant à mot de passe (provider credential) trouvé.",
		);
		process.exit(1);
	}

	for (const account of admins) {
		await db
			.update(schema.account)
			.set({ password: adminHash })
			.where(eq(schema.account.id, account.accountId));
	}
	for (const account of managers) {
		await db
			.update(schema.account)
			.set({ password: managerHash })
			.where(eq(schema.account.id, account.accountId));
	}

	console.log(
		`✔ ${admins.length} compte(s) admin et ${managers.length} compte(s) gérant mis à jour.`,
	);
	console.log(
		"   Les sessions ouvertes restent valides ; les nouveaux logins utilisent les nouveaux mots de passe.",
	);
	await pool.end();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});