import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import { generateId } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const connectionString =
	process.env.DATABASE_URL ||
	"postgresql://postgres:@localhost:5432/ResaMountain";
const pool = new pg.Pool({ connectionString });
const db = drizzle(pool, { schema });

type Category = { id: string; name: string; slug: string };

async function main() {
	console.log("⏳ Début du peuplement de la base de données...");

	await db.delete(schema.reservationItems);
	await db.delete(schema.reservations);
	await db.delete(schema.priceOptions);
	await db.delete(schema.variantAttributes);
	await db.delete(schema.itemVariants);
	await db.delete(schema.items);
	await db.delete(schema.categories);
	await db.delete(schema.rentalDurations);
	await db.delete(schema.session);
	await db.delete(schema.account);
	await db.delete(schema.user);

	console.log("🧹 Base de données nettoyée.");

	// --- Durées de location ---
	await db.insert(schema.rentalDurations).values([
		{ label: "1 jour", days: 1, sortOrder: 0 },
		{ label: "2 jours", days: 2, sortOrder: 1 },
		{ label: "3 jours", days: 3, sortOrder: 2 },
		{ label: "7 jours", days: 7, sortOrder: 3 },
	]);

	// --- Admin ---
	console.log("🔑 Génération du compte administrateur...");

	const hashedPassword = await hashPassword("SuperSecretPassword123!");
	const userId = generateId();
	const accountId = generateId();

	const [adminUser] = await db
		.insert(schema.user)
		.values({
			id: userId,
			name: "Responsable Magasin",
			email: "admin@decathlon.com",
			emailVerified: true,
			role: "admin",
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.returning();

	await db.insert(schema.account).values({
		id: accountId,
		userId: adminUser.id,
		accountId: "admin@decathlon.com",
		providerId: "credential",
		password: hashedPassword,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	console.log(`✅ Compte admin créé (ID: ${adminUser.id})`);

	// --- Gérant du magasin (accès dashboard, tarification en lecture seule) ---
	const managerPassword = await hashPassword("ManagerPassword123!");
	const managerUserId = generateId();
	const managerAccountId = generateId();

	const [managerUser] = await db
		.insert(schema.user)
		.values({
			id: managerUserId,
			name: "Gérant du magasin",
			email: "gerant@decathlon.com",
			emailVerified: true,
			role: "manager",
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.returning();

	await db.insert(schema.account).values({
		id: managerAccountId,
		userId: managerUser.id,
		accountId: "gerant@decathlon.com",
		providerId: "credential",
		password: managerPassword,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	console.log(
		`✅ Compte gérant créé (ID: ${managerUser.id}) — gerant@decathlon.com / ManagerPassword123!`,
	);

	// --- Utilisateur standard (pour tester le blocage) ---
	console.log("👤 Génération d'un compte utilisateur standard...");

	const userPassword = await hashPassword("UserPassword123!");
	const regularUserId = generateId();
	const regularAccountId = generateId();

	const [regularUser] = await db
		.insert(schema.user)
		.values({
			id: regularUserId,
			name: "Jean Client",
			email: "jean@client.com",
			emailVerified: true,
			role: "user",
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.returning();

	await db.insert(schema.account).values({
		id: regularAccountId,
		userId: regularUser.id,
		accountId: "jean@client.com",
		providerId: "credential",
		password: userPassword,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	console.log(
		`✅ Compte utilisateur standard créé (ID: ${regularUser.id}) — jean@client.com / UserPassword123!`,
	);

	// --- Catégories ---
	console.log("📦 Insertion du catalogue matériel...");
	const [catEscalade, catRando, catBivouac, catVia] = await db
		.insert(schema.categories)
		.values([
			{ name: "Escalade & Bloc", slug: "escalade-bloc" },
			{ name: "Randonnée", slug: "randonnee" },
			{ name: "Bivouac", slug: "bivouac" },
			{ name: "Via Ferrata", slug: "via-ferrata" },
		])
		.returning();

	const cats: Record<string, Category> = {
		escalade: catEscalade,
		rando: catRando,
		bivouac: catBivouac,
		via: catVia,
	};

	// --- Articles ---
	type PriceOptionDef = {
		label: string;
		duration: number;
		price: string;
		barcode: string;
	};

	type VariantDef = {
		sku: string;
		totalStock: number;
		dailyPrice: string;
		pricingMode?: "per_day" | "per_duration";
		attributes: { name: string; value: string }[];
		priceOptions: PriceOptionDef[];
	};

	type ItemDef = {
		categoryId: string;
		name: string;
		description: string;
		brand: string;
		season?: "winter" | "summer" | "all";
		decathlonUrl?: string;
		images?: Array<{ url: string; alt: string }>;
		availableFrom?: string;
		availableTo?: string;
		minDuration?: number;
		minDurationUnit?: "half_day" | "day";
		variants: VariantDef[];
	};

	const items: ItemDef[] = [
		// ESCALADE
		{
			categoryId: cats.escalade.id,
			name: "Crashpad Simond Edge",
			description:
				"Idéal pour amortir les chutes en bloc outdoor. Sangles de transport confortables.",
			brand: "Simond",
			minDuration: 1,
			minDurationUnit: "half_day",
			images: [
				{
					url: "https://contents.mediadecathlon.com/p2584221/k$52b3b0c5e6c5b0c5e6c5b0c5e6c5b0c5/crashpad-simond-edge.jpg?format=auto&quality=70&f=650x0",
					alt: "Crashpad Simond Edge vue d'ensemble",
				},
			],
			variants: [
				{
					sku: "8547123",
					totalStock: 4,
					dailyPrice: "12.00",
					pricingMode: "per_day",
					attributes: [
						{ name: "dimension", value: "120x100x12cm" },
						{ name: "usage", value: "Bloc Extérieur" },
					],
					priceOptions: [],
				},
			],
		},
		{
			categoryId: cats.escalade.id,
			name: "Baudrier Simond Edge",
			description: "Baudrier d'escalade polyvalent, tailles S/M/L",
			brand: "Simond",
			variants: [
				{
					sku: "8612345",
					totalStock: 4,
					dailyPrice: "6.00",
					attributes: [{ name: "taille", value: "M" }],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "6.00",
							barcode: "PO-00004",
						},
					],
				},
				{
					sku: "8612346",
					totalStock: 3,
					dailyPrice: "6.00",
					attributes: [{ name: "taille", value: "L" }],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "6.00",
							barcode: "PO-00006",
						},
					],
				},
			],
		},
		{
			categoryId: cats.escalade.id,
			name: "Casque Simond Sense",
			description: "Casque d'escalade ultraléger",
			brand: "Simond",
			variants: [
				{
					sku: "8623456",
					totalStock: 5,
					dailyPrice: "4.00",
					attributes: [],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "4.00",
							barcode: "PO-00008",
						},
					],
				},
			],
		},
		{
			categoryId: cats.escalade.id,
			name: "Set de mousquetons Simond",
			description: "Lot de 5 mousquetons à vis",
			brand: "Simond",
			variants: [
				{
					sku: "8634567",
					totalStock: 10,
					dailyPrice: "2.00",
					attributes: [],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "2.00",
							barcode: "PO-00010",
						},
					],
				},
			],
		},

		// RANDONNÉE
		{
			categoryId: cats.rando.id,
			name: "Sac à Dos Quechua MH500",
			description:
				"Sac à dos ventilé pour la randonnée à la journée ou sur deux jours.",
			brand: "Quechua",
			variants: [
				{
					sku: "8649512",
					totalStock: 3,
					dailyPrice: "10.00",
					attributes: [
						{ name: "volume", value: "40L" },
						{ name: "taille_dos", value: "S" },
					],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "10.00",
							barcode: "PO-00012",
						},
						{
							label: "2 jours",
							duration: 2,
							price: "18.00",
							barcode: "PO-00011",
						},
						{
							label: "7 jours",
							duration: 7,
							price: "55.00",
							barcode: "PO-00013",
						},
					],
				},
				{
					sku: "8649513",
					totalStock: 5,
					dailyPrice: "11.00",
					attributes: [
						{ name: "volume", value: "45L" },
						{ name: "taille_dos", value: "L" },
					],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "11.00",
							barcode: "PO-00014",
						},
					],
				},
			],
		},
		{
			categoryId: cats.rando.id,
			name: "Bâtons de marche Forclaz 500",
			description: "Bâtons télescopiques en aluminium, paires",
			brand: "Forclaz",
			variants: [
				{
					sku: "8504123",
					totalStock: 10,
					dailyPrice: "3.00",
					attributes: [],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "3.00",
							barcode: "PO-00016",
						},
					],
				},
			],
		},
		{
			categoryId: cats.rando.id,
			name: "Gourde filtrante Quechua 1L",
			description: "Gourde avec filtre intégré pour remplir en pleine nature",
			brand: "Quechua",
			variants: [
				{
					sku: "8601234",
					totalStock: 8,
					dailyPrice: "2.50",
					attributes: [],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "2.50",
							barcode: "PO-00018",
						},
					],
				},
			],
		},

		// BIVOUAC
		{
			categoryId: cats.bivouac.id,
			name: "Tente Quechua 2 Secondes",
			description: "Tente à déploiement rapide, facile à monter",
			brand: "Quechua",
			availableFrom: "06-15",
			availableTo: "09-30",
			minDuration: 2,
			minDurationUnit: "day",
			images: [
				{
					url: "https://contents.mediadecathlon.com/p1234567/k$abc123/tente-quechua-2-secondes.jpg?format=auto&quality=70&f=650x0",
					alt: "Tente Quechua 2 Secondes montée",
				},
				{
					url: "https://contents.mediadecathlon.com/p1234568/k$abc124/tente-quechua-2-secondes-detail.jpg?format=auto&quality=70&f=650x0",
					alt: "Tente Quechua 2 Secondes détail déploiement",
				},
			],
			variants: [
				{
					sku: "8512345",
					totalStock: 3,
					dailyPrice: "15.00",
					attributes: [{ name: "places", value: "2" }],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "15.00",
							barcode: "PO-00020",
						},
						{
							label: "3 jours",
							duration: 3,
							price: "45.00",
							barcode: "PO-00021",
						},
					],
				},
				{
					sku: "8512346",
					totalStock: 2,
					dailyPrice: "20.00",
					attributes: [{ name: "places", value: "3" }],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "20.00",
							barcode: "PO-00023",
						},
						{
							label: "3 jours",
							duration: 3,
							price: "60.00",
							barcode: "PO-00024",
						},
					],
				},
			],
		},
		{
			categoryId: cats.bivouac.id,
			name: "Sac de couchage Forclaz MT100",
			description: "Sac de couchage confort 10°C, synthétique",
			brand: "Forclaz",
			variants: [
				{
					sku: "8523456",
					totalStock: 6,
					dailyPrice: "5.00",
					attributes: [],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "5.00",
							barcode: "PO-00026",
						},
						{
							label: "3 jours",
							duration: 3,
							price: "15.00",
							barcode: "PO-00027",
						},
					],
				},
			],
		},
		{
			categoryId: cats.bivouac.id,
			name: "Matelas de sol Forclaz",
			description: "Matelas autogonflant 4cm",
			brand: "Forclaz",
			variants: [
				{
					sku: "8534567",
					totalStock: 6,
					dailyPrice: "4.00",
					attributes: [],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "4.00",
							barcode: "PO-00029",
						},
					],
				},
			],
		},

		// VIA FERRATA
		{
			categoryId: cats.via.id,
			name: "Kit via ferrata Simond Vertige",
			description: "Kit complet avec absorbeur d'énergie et mousquetons",
			brand: "Simond",
			variants: [
				{
					sku: "8712345",
					totalStock: 4,
					dailyPrice: "12.00",
					attributes: [],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "12.00",
							barcode: "PO-00031",
						},
					],
				},
			],
		},
		{
			categoryId: cats.via.id,
			name: "Casque Simond Cliff",
			description: "Casque spécial via ferrata avec lampe frontale",
			brand: "Simond",
			variants: [
				{
					sku: "8723456",
					totalStock: 5,
					dailyPrice: "5.00",
					attributes: [],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "5.00",
							barcode: "PO-00033",
						},
					],
				},
			],
		},
		{
			categoryId: cats.via.id,
			name: "Gants via ferrata Simond",
			description: "Gants renforcés paume cuir",
			brand: "Simond",
			variants: [
				{
					sku: "8734567",
					totalStock: 8,
					dailyPrice: "3.00",
					attributes: [{ name: "taille", value: "M" }],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "3.00",
							barcode: "PO-00035",
						},
					],
				},
				{
					sku: "8734568",
					totalStock: 8,
					dailyPrice: "3.00",
					attributes: [{ name: "taille", value: "L" }],
					priceOptions: [
						{
							label: "1 jour",
							duration: 1,
							price: "3.00",
							barcode: "PO-00037",
						},
					],
				},
			],
		},
	];

	for (const item of items) {
		const [insertedItem] = await db
			.insert(schema.items)
			.values({
				categoryId: item.categoryId,
				name: item.name,
				description: item.description,
				brand: item.brand,
				season: item.season ?? "all",
				decathlonUrl: item.decathlonUrl ?? null,
				availableFrom: item.availableFrom ?? null,
				availableTo: item.availableTo ?? null,
				minDuration: item.minDuration ?? 1,
				minDurationUnit: item.minDurationUnit ?? "half_day",
			})
			.returning();

		for (const variant of item.variants) {
			const [insertedVariant] = await db
				.insert(schema.itemVariants)
				.values({
					itemId: insertedItem.id,
					decathlonSku: variant.sku,
					totalStock: variant.totalStock,
					dailyPrice: variant.dailyPrice,
					pricingMode: variant.pricingMode ?? "per_duration",
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

			if (variant.priceOptions.length > 0) {
				await db.insert(schema.priceOptions).values(
					variant.priceOptions.map((opt) => ({
						variantId: insertedVariant.id,
						label: opt.label,
						duration: opt.duration,
						price: opt.price,
						barcode: opt.barcode,
					})),
				);
			}
		}

		if (item.images && item.images.length > 0) {
			await db.insert(schema.itemImages).values(
				item.images.map((img, i) => ({
					itemId: insertedItem.id,
					url: img.url,
					alt: img.alt,
					sortOrder: i,
				})),
			);
		}
	}

	console.log(
		`✅ ${items.length} articles insérés avec leurs variantes, attributs et images.`,
	);

	await db
		.insert(schema.billingSettings)
		.values({
			id: 1,
			monthlyFee: "30.00",
			commissionRate: "10.00",
		})
		.onConflictDoNothing();
	console.log("🔢 Paramètres de facturation créés (30 €/mois + 10 %).");

	console.log("🚀 Base de données peuplée avec succès !");
	await pool.end();
	process.exit(0);
}

main().catch(async (err) => {
	console.error("❌ Erreur lors du seed de la base de données :", err);
	await pool.end();
	process.exit(1);
});
