import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const connectionString =
	process.env.DATABASE_URL ||
	"postgresql://postgres:@localhost:5432/ResaMountain";
const pool = new pg.Pool({ connectionString });
const db = drizzle(pool, { schema });

// PRNG déterministe (mulberry32) pour des données historiques reproductibles
function mulberry32(seed: number) {
	return () => {
		let t = seed + 0x6d2b79f5;
		seed = t;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const FIRST_NAMES = [
	"Lucas",
	"Emma",
	"Hugo",
	"Camille",
	"Louis",
	"Léa",
	"Arthur",
	"Chloé",
	"Gabriel",
	"Manon",
	"Jules",
	"Sarah",
	"Adam",
	"Inès",
	"Raphaël",
	"Nina",
	"Paul",
	"Juliette",
	"Nathan",
	"Lola",
	"Tom",
	"Alice",
	"Maxime",
	"Zoé",
	"Enzo",
	"Lucie",
	"Antoine",
	"Margaux",
	"Théo",
	"Clara",
	"Nolan",
	"Ambre",
	"Victor",
	"Louna",
	"Simon",
	"Rose",
];

const LAST_NAMES = [
	"Dupont",
	"Martin",
	"Bernard",
	"Petit",
	"Durand",
	"Leroy",
	"Moreau",
	"Simon",
	"Laurent",
	"Lefebvre",
	"Michel",
	"Garcia",
	"David",
	"Bertrand",
	"Roux",
	"Vincent",
	"Fournier",
	"Morel",
	"Girard",
	"André",
	"Lefevre",
	"Mercier",
	"Blanc",
	"Guerin",
	"Boyer",
	"Garnier",
	"Chevalier",
	"Perrin",
	"Faure",
	"Clement",
	"Dumas",
	"Renard",
	"Renaud",
	"Lambert",
	"Henry",
];

type CatalogVariant = {
	id: string;
	itemId: string;
	itemName: string;
	categoryId: string;
	pricingMode: "per_day" | "per_duration";
	dailyPrice: string;
	options: Array<{
		id: string;
		duration: number;
		price: string;
		label: string;
	}>;
};

// Saisonnalité mensuelle (0 = janvier ... 11 = décembre)
const MONTH_FACTOR = [
	0.45, 0.6, 0.8, 1.0, 1.15, 1.3, 1.5, 1.6, 1.25, 1.05, 0.6, 0.5,
];
// extract(dow) -> 0 (dimanche) ... 6 (samedi)
const DOW_FACTOR = [1.3, 0.9, 0.85, 0.9, 1.0, 1.15, 1.45];

function pickOption(variant: CatalogVariant, roll: number) {
	if (variant.pricingMode !== "per_duration" || variant.options.length === 0) {
		return null;
	}
	// Plus l'option est courte, plus elle est fréquente
	const weights = variant.options.map((_, idx) => 1 / (idx + 1));
	const total = weights.reduce((a, b) => a + b, 0);
	let acc = 0;
	const target = roll * total;
	for (let i = 0; i < weights.length; i++) {
		acc += weights[i];
		if (target <= acc) return variant.options[i];
	}
	return variant.options[variant.options.length - 1];
}

type InsertedReservation = {
	row: typeof schema.reservations.$inferInsert;
	lineItems: Array<
		Omit<typeof schema.reservationItems.$inferInsert, "reservationId">
	>;
};

async function main() {
	console.log("⏳ Génération de l'historique de location...");

	const rng = mulberry32(20260915);

	const rows = await db
		.select({
			id: schema.itemVariants.id,
			itemId: schema.itemVariants.itemId,
			itemName: schema.items.name,
			categoryId: schema.items.categoryId,
			pricingMode: schema.itemVariants.pricingMode,
			dailyPrice: schema.itemVariants.dailyPrice,
		})
		.from(schema.itemVariants)
		.innerJoin(schema.items, eq(schema.items.id, schema.itemVariants.itemId))
		.where(eq(schema.itemVariants.status, "AVAILABLE"));

	if (rows.length === 0) {
		throw new Error(
			"Aucune variante disponible. Lancez d'abord `npm run db:seed`.",
		);
	}

	// Nettoyage des données historiques (garder l'admin)
	const adminId = (
		await db
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(eq(schema.user.role, "admin"))
	)[0]?.id;
	if (adminId) {
		await db.delete(schema.reservationItems);
		await db.delete(schema.reservations);
		await db.delete(schema.user).where(eq(schema.user.role, "user"));
	}

	const options = await db
		.select({
			id: schema.priceOptions.id,
			variantId: schema.priceOptions.variantId,
			label: schema.priceOptions.label,
			duration: schema.priceOptions.duration,
			price: schema.priceOptions.price,
		})
		.from(schema.priceOptions);

	const optionsByVariant = new Map<string, CatalogVariant["options"]>();
	for (const option of options) {
		const list = optionsByVariant.get(option.variantId) ?? [];
		list.push({
			id: option.id,
			label: option.label,
			duration: option.duration,
			price: option.price,
		});
		optionsByVariant.set(option.variantId, list);
	}

	const catalog: CatalogVariant[] = rows.map((v) => ({
		...v,
		options: [...(optionsByVariant.get(v.id) ?? [])].sort(
			(a, b) => a.duration - b.duration,
		),
	}));

	// --- Utilisateurs factices ---
	const userCount = 70;
	const users: Array<typeof schema.user.$inferInsert> = [];
	const usersById: Record<string, string> = {}; // id -> email for uniqueness
	const usedEmails = new Set<string>();

	for (let i = 0; i < userCount; i++) {
		const firstName = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
		const lastName = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
		const slug = `${firstName.toLowerCase()}.${lastName
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")}`;
		let email = `${slug}@example.fr`;
		let n = 2;
		while (usedEmails.has(email)) {
			email = `${slug}${n}@example.fr`;
			n++;
		}
		usedEmails.add(email);

		const id = randomUUID();
		const createdAt = new Date(Date.now() - Math.floor(rng() * 700) * 86400000);
		usersById[id] = email;
		users.push({
			id,
			name: `${firstName} ${lastName}`,
			email,
			emailVerified: true,
			role: "user",
			phone: `06 ${String(10 + Math.floor(rng() * 89))} ${String(
				10 + Math.floor(rng() * 89),
			)} ${String(10 + Math.floor(rng() * 89))} ${String(
				10 + Math.floor(rng() * 89),
			)}`,
			loyaltyCard:
				rng() < 0.35 ? `DC${100000 + Math.floor(rng() * 900000)}` : null,
			createdAt,
			updatedAt: createdAt,
		});
	}

	await db.insert(schema.user).values(users);
	const userIds = Object.keys(usersById);
	console.log(`👥 ${users.length} clients factices créés.`);

	// --- Réservations sur l'année écoulée ---
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const basePerDay = 2.5;
	const reservations: InsertedReservation[] = [];

	for (let offset = 364; offset >= 0; offset--) {
		const day = new Date(today);
		day.setDate(day.getDate() - offset);
		day.setHours(0, 0, 0, 0);

		const factor =
			MONTH_FACTOR[day.getMonth()] *
			DOW_FACTOR[day.getDay()] *
			(0.85 + rng() * 0.3);
		const count = Math.max(0, Math.round(basePerDay * factor));

		for (let k = 0; k < count; k++) {
			const userId = userIds[Math.floor(rng() * userIds.length)];
			const nowMs = Date.now();

			const durationRoll = rng();
			const duration =
				durationRoll < 0.5
					? 1
					: durationRoll < 0.72
						? 2
						: durationRoll < 0.85
							? 3
							: durationRoll < 0.95
								? 7
								: 14;

			const variant = catalog[Math.floor(rng() * catalog.length)];
			const option = pickOption(variant, rng());
			const effectiveDuration = option ? option.duration : duration;

			const pickup = new Date(day);
			pickup.setHours(
				9 + Math.floor(rng() * 7),
				10 + Math.floor(rng() * 50),
				0,
				0,
			);
			const retour = new Date(pickup);
			retour.setDate(retour.getDate() + effectiveDuration);
			retour.setHours(
				14 + Math.floor(rng() * 4),
				10 + Math.floor(rng() * 50),
				0,
				0,
			);

			const inFuture = pickup.getTime() > nowMs;
			let status: typeof schema.reservations.$inferInsert.status;
			if (inFuture) {
				status = rng() < 0.25 ? "PENDING_VERIFICATION" : "CONFIRMED";
			} else if (retour.getTime() > nowMs) {
				status = rng() < 0.15 ? "COLLECTED" : "RETURNED";
			} else {
				const roll = rng();
				status =
					roll < 0.68 ? "RETURNED" : roll < 0.86 ? "CANCELLED" : "EXPIRED";
			}

			const expiration = new Date(pickup);
			expiration.setHours(expiration.getHours() + 2);

			const createdAt = new Date(pickup);
			createdAt.setDate(createdAt.getDate() - Math.floor(rng() * 12));

			const lineCount = rng() < 0.7 ? 1 : rng() < 0.92 ? 2 : 3;
			const lineItems: Array<
				Omit<typeof schema.reservationItems.$inferInsert, "reservationId">
			> = [];
			let totalPrice = 0;

			for (let li = 0; li < lineCount; li++) {
				const lv = catalog[Math.floor(rng() * catalog.length)];
				const lopt = pickOption(lv, rng());
				const quantity = 1 + (rng() < 0.15 ? 1 : 0);

				if (lv.pricingMode === "per_duration" && lopt) {
					const price = Number.parseFloat(lopt.price);
					totalPrice += price * quantity;
					lineItems.push({
						variantId: lv.id,
						priceOptionId: lopt.id,
						label: lopt.label,
						quantity,
						priceAppliedAtReservation: lopt.price,
					});
				} else {
					const daily = Math.max(1, Number.parseFloat(lv.dailyPrice));
					const days = Math.round(Math.min(14, Math.max(1, effectiveDuration)));
					const price = daily * days;
					totalPrice += price * quantity;
					lineItems.push({
						variantId: lv.id,
						priceOptionId: null,
						label: `${days} jour${days > 1 ? "s" : ""} · ${daily.toFixed(2)} €/j`,
						quantity,
						priceAppliedAtReservation: price.toFixed(2),
					});
				}
			}

			const isExpired = status === "EXPIRED";
			reservations.push({
				row: {
					id: randomUUID(),
					userId,
					status,
					pickupDate: pickup,
					returnDate: retour,
					expirationAtribute: expiration,
					totalPrice: totalPrice.toFixed(2),
					createdAt,
					isNoShow: isExpired ? 1 : 0,
				},
				lineItems,
			});
		}
	}

	console.log(`📅 ${reservations.length} réservations générées.`);

	await db.insert(schema.reservations).values(reservations.map((r) => r.row));
	await db.insert(schema.reservationItems).values(
		reservations.flatMap((r) =>
			r.lineItems.map((line) => ({
				...line,
				reservationId: r.row.id as string,
			})),
		),
	);

	console.log("✅ Historique inséré avec succès.");
	await pool.end();
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
