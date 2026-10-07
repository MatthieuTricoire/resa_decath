import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import { randomUUID } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { addDaysToDateKey, dateKeyToUtcNoon, todayInParis } from "#/lib/dates";
import {
	generateReservationAccessToken,
	generateReservationReference,
} from "#/lib/reservation-reference";
import * as schema from "./schema";

/**
 * Jeu de données de démonstration, rejouable autant de fois que nécessaire.
 *
 * Les tableaux du jour, tels que `classifyScheduleRow` les classe :
 *
 * - 10 réservations **à prélever aujourd'hui** (`CONFIRMED`, retrait aujourd'hui) ;
 * - 10 réservations **à rendre aujourd'hui** (`COLLECTED`, retour aujourd'hui) ;
 * - 10 réservations **en retard de rendu** (`COLLECTED`, retour dépassé de 1 à
 *   21 jours, pour montrer les badges « Retour en retard · N j ») ;
 * - 10 réservations **en retrait dépassé** (`CONFIRMED`, retrait prévu il y a
 *   1 à 21 jours et jamais effectué : le client n'est pas venu). Ce sont elles
 *   qui peuplent « Retraits dépassés — matériel à libérer » et déclenchent la
 *   dialogue d'annulation avec la case « Client non présenté » pré-cochée ;
 * - 3 réservations **annulées pour non-présentation** (`CANCELLED`,
 *   `is_no_show = 1`) : invisibles des tableaux du jour, elles affichent le
 *   badge « Non présenté » sur la fiche client et la fiche réservation.
 *
 * Le script est idempotent : il ne touche ni au catalogue, ni à l'historique de
 * `db:seed:history`, et repart de zéro en supprimant ses propres données
 * (reconnaissables au domaine d'email `demo.example.fr`).
 *
 * Ordre conseillé avant une démo :
 * `npm run db:seed && npm run db:seed:history && npm run db:seed:demo`
 * (`db:seed:history` efface toutes les réservations et tous les clients : il
 * passe donc avant ce script).
 */

const connectionString =
	process.env.DATABASE_URL ||
	"postgresql://postgres:@localhost:5432/ResaMountain";
const pool = new pg.Pool({ connectionString });
const db = drizzle(pool, { schema });

/** Nombre de réservations par tableau. */
const GROUP_SIZE = 10;

/** Domaine réservé aux clients de démo : sert aussi de marqueur de nettoyage. */
const DEMO_EMAIL_DOMAIN = "demo.example.fr";

/**
 * Retards de retour, en jours civils, du plus proche au plus loin.
 * Échelonnés exprès : le tableau du jour affiche « Retour en retard » dès J+1,
 * puis « · N j » au-delà.
 */
const LATE_RETURN_DELAYS = [1, 2, 3, 4, 5, 7, 10, 12, 15, 21];

/**
 * Retards de retrait, en jours civils, du plus proche au plus loin.
 * Même échelonnage que les retours : « Retraits dépassés » affiche
 * « il y a N jours » à différentes valeurs.
 */
const LATE_PICKUP_DELAYS = [1, 2, 3, 4, 5, 7, 10, 12, 15, 21];

/** Réservations annulées pour non-présentation (badge « Non présenté »). */
const NO_SHOW_COUNT = 3;
const NO_SHOW_DELAYS = [3, 7, 14];

const FIRST_NAMES = [
	"Camille",
	"Thomas",
	"Léa",
	"Nicolas",
	"Sarah",
	"Julien",
	"Manon",
	"Alexis",
	"Clara",
	"Kévin",
	"Émilie",
	"Laurent",
	"Pauline",
	"Damien",
	"Anna",
	"Pierre",
	"Mélanie",
	"Antoine",
	"Justine",
	"Rémi",
	"Louise",
	"Gaëtan",
	"Inès",
	"Bastien",
	"Romane",
	"Mathieu",
	"Agnès",
	"Valentin",
	"Karine",
	"Hugo",
];

const LAST_NAMES = [
	"Martin",
	"Dupont",
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
];

type CatalogVariant = {
	id: string;
	itemName: string;
	brand: string;
	options: Array<{
		id: string;
		label: string;
		duration: number;
		price: string;
	}>;
};

type DemoReservation = {
	row: typeof schema.reservations.$inferInsert;
	lineItems: Array<
		Omit<typeof schema.reservationItems.$inferInsert, "reservationId">
	>;
};

/** `YYYY-MM-DD` → Date à midi UTC, avec une erreur lisible si la clé est fausse. */
function utcNoon(key: string, context: string): Date {
	const date = dateKeyToUtcNoon(key);
	if (!date) throw new Error(`Date invalide (${context}) : ${key}`);
	return date;
}

function shiftDateKey(key: string, days: number, context: string): string {
	const shifted = addDaysToDateKey(key, days);
	if (!shifted) {
		throw new Error(
			`Date invalide après décalage de ${days} j (${context}) : ${key}`,
		);
	}
	return shifted;
}

/** Identité d'un client de démo, déterministe et lisible au comptoir. */
function demoIdentity(index: number) {
	const first = FIRST_NAMES[index % FIRST_NAMES.length];
	const last = LAST_NAMES[index % LAST_NAMES.length];
	const number = String(index + 1).padStart(2, "0");
	return {
		// Id déterministe : la réservation et la ligne de client doivent porter
		// le même identifiant, et un passage suivant repart de la même base.
		id: `demo-user-${number}`,
		name: `${first} ${last}`,
		email: `demo${number}@${DEMO_EMAIL_DOMAIN}`,
		phone: `06 5${number[0]} ${number[1]}${number[0]} ${number[1]}${number[0]} ${number[1]}${number[0]}`,
		// Une carte fidélité sur deux : la colonne du tableau mérite d'être
		// montrée remplie comme vide.
		loyaltyCard: index % 2 === 0 ? `DC${200000 + index * 137}` : null,
	};
}

/**
 * Assemble une réservation de démo : une ligne, l'option de prix choisie, la
 * référence et le jeton de la page de confirmation publique.
 *
 * La fenêtre respecte le sens du site : `countRentalDays` compte les bornes
 * incluses, donc retour = retrait + (durée - 1) jours. Le prix de l'option et
 * la durée annoncée restent ainsi cohérents.
 */
function makeReservation(input: {
	userIndex: number;
	variant: CatalogVariant;
	option: CatalogVariant["options"][number];
	pickupKey: string;
	returnKey: string;
	status: "CONFIRMED" | "COLLECTED" | "CANCELLED";
	/** Non-présentation constatée : à ne poser que sur une annulation. */
	isNoShow?: boolean;
}): DemoReservation {
	const pickup = utcNoon(input.pickupKey, "retrait");
	const returned = utcNoon(input.returnKey, "retour");
	const identity = demoIdentity(input.userIndex);
	const createdAt = new Date(Date.now() - (7 + input.userIndex) * 86400000);

	return {
		row: {
			id: randomUUID(),
			reference: generateReservationReference(),
			accessToken: generateReservationAccessToken(),
			userId: identity.id,
			status: input.status,
			// Tantôt en ligne, tantôt au comptoir : les deux canaux existent.
			source: input.userIndex % 2 === 0 ? "WEB" : "STORE",
			pickupDate: pickup,
			returnDate: returned,
			// Délai no-show : deux heures après le retrait prévu.
			expirationAtribute: new Date(pickup.getTime() + 2 * 3600 * 1000),
			totalPrice: input.option.price,
			createdAt,
			isNoShow: input.isNoShow ? 1 : 0,
		},
		lineItems: [
			{
				variantId: input.variant.id,
				priceOptionId: input.option.id,
				label: input.option.label,
				quantity: 1,
				priceAppliedAtReservation: input.option.price,
			},
		],
	};
}

async function main() {
	console.log("⏳ Génération du jeu de données de démonstration...");

	// --- Catalogue ---
	const variantRows = await db
		.select({
			id: schema.itemVariants.id,
			itemName: schema.items.name,
			brand: schema.items.brand,
		})
		.from(schema.itemVariants)
		.innerJoin(schema.items, eq(schema.items.id, schema.itemVariants.itemId))
		.where(eq(schema.itemVariants.status, "AVAILABLE"));

	const optionRows = await db
		.select({
			id: schema.priceOptions.id,
			variantId: schema.priceOptions.variantId,
			label: schema.priceOptions.label,
			duration: schema.priceOptions.duration,
			price: schema.priceOptions.price,
		})
		.from(schema.priceOptions)
		.where(eq(schema.priceOptions.isActive, true));

	const optionsByVariant = new Map<string, CatalogVariant["options"]>();
	for (const option of optionRows) {
		const list = optionsByVariant.get(option.variantId) ?? [];
		list.push({
			id: option.id,
			label: option.label,
			duration: option.duration,
			price: option.price,
		});
		optionsByVariant.set(option.variantId, list);
	}

	// Sans option de prix, une ligne de démo n'aurait ni tarif ni code-barres à
	// rejouer à la caisse : on écarte la variante du tirage.
	const catalog: CatalogVariant[] = variantRows
		.map((variant) => ({
			id: variant.id,
			itemName: variant.itemName,
			brand: variant.brand,
			options: (optionsByVariant.get(variant.id) ?? []).sort(
				(a, b) => a.duration - b.duration,
			),
		}))
		.filter((variant) => variant.options.length > 0);

	if (catalog.length === 0) {
		throw new Error(
			"Aucune variante disponible avec des options de prix. Lancez d'abord `npm run db:seed`.",
		);
	}

	// --- Nettoyage des données de démo précédentes ---
	const previousDemoUsers = await db
		.select({ id: schema.user.id })
		.from(schema.user)
		.where(like(schema.user.email, `%@${DEMO_EMAIL_DOMAIN}`));

	if (previousDemoUsers.length > 0) {
		const userIds = previousDemoUsers.map((user) => user.id);
		const previousReservations = await db
			.select({ id: schema.reservations.id })
			.from(schema.reservations)
			.where(inArray(schema.reservations.userId, userIds));

		if (previousReservations.length > 0) {
			const reservationIds = previousReservations.map(
				(reservation) => reservation.id,
			);
			await db
				.delete(schema.reservationItems)
				.where(inArray(schema.reservationItems.reservationId, reservationIds));
			await db
				.delete(schema.reservations)
				.where(inArray(schema.reservations.id, reservationIds));
		}

		await db.delete(schema.user).where(inArray(schema.user.id, userIds));
		console.log(
			`🧹 ${previousReservations.length} réservation(s) et ${previousDemoUsers.length} client(s) de démo supprimés.`,
		);
	}

	// --- Clients de démo (un par réservation) ---
	const total = GROUP_SIZE * 4 + NO_SHOW_COUNT;
	const users: Array<typeof schema.user.$inferInsert> = [];
	for (let index = 0; index < total; index++) {
		const identity = demoIdentity(index);
		users.push({
			id: identity.id,
			name: identity.name,
			email: identity.email,
			emailVerified: true,
			role: "user",
			phone: identity.phone,
			loyaltyCard: identity.loyaltyCard,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	}
	await db.insert(schema.user).values(users);
	console.log(`👥 ${users.length} clients de démo créés.`);

	// --- Réservations ---
	const today = todayInParis();
	const reservations: DemoReservation[] = [];

	/**
	 * Une variante du catalogue, en rotation : les tableaux du comptoir doivent
	 * étaler dix produits différents, pas le même article dix fois.
	 */
	const variantAt = (index: number) => catalog[index % catalog.length];

	// 1. À prélever aujourd'hui : CONFIRMED, retrait = aujourd'hui.
	for (let i = 0; i < GROUP_SIZE; i++) {
		const variant = variantAt(i);
		const option = variant.options[i % variant.options.length];
		const pickupKey = today;
		const returnKey = shiftDateKey(
			pickupKey,
			option.duration - 1,
			"retrait du jour",
		);

		reservations.push(
			makeReservation({
				userIndex: i,
				variant,
				option,
				pickupKey,
				returnKey,
				status: "CONFIRMED",
			}),
		);
	}

	// 2. À rendre aujourd'hui : COLLECTED, retour = aujourd'hui.
	for (let i = 0; i < GROUP_SIZE; i++) {
		const variant = variantAt(GROUP_SIZE + i);
		const option = variant.options[i % variant.options.length];
		const returnKey = today;
		const pickupKey = shiftDateKey(
			returnKey,
			-(option.duration - 1),
			"retour du jour",
		);

		reservations.push(
			makeReservation({
				userIndex: GROUP_SIZE + i,
				variant,
				option,
				pickupKey,
				returnKey,
				status: "COLLECTED",
			}),
		);
	}

	// 3. Retours en retard : COLLECTED, retour dépassé de X jours.
	for (let i = 0; i < GROUP_SIZE; i++) {
		const variant = variantAt(GROUP_SIZE * 2 + i);
		const option = variant.options[i % variant.options.length];
		const delay = LATE_RETURN_DELAYS[i % LATE_RETURN_DELAYS.length];
		const returnKey = shiftDateKey(today, -delay, "retour en retard");
		const pickupKey = shiftDateKey(
			returnKey,
			-(option.duration - 1),
			"retour en retard",
		);

		reservations.push(
			makeReservation({
				userIndex: GROUP_SIZE * 2 + i,
				variant,
				option,
				pickupKey,
				returnKey,
				status: "COLLECTED",
			}),
		);
	}

	// 4. Retraits dépassés, client jamais venu : CONFIRMED avec un retrait déjà
	//    passé de X jours. Ce sont eux qui peuplent « Retraits dépassés —
	//    matériel à libérer » : l'annulation ouvre la dialogue avec la case
	//    « Client non présenté » pré-cochée.
	for (let i = 0; i < GROUP_SIZE; i++) {
		const variant = variantAt(GROUP_SIZE * 3 + i);
		const option = variant.options[i % variant.options.length];
		const delay = LATE_PICKUP_DELAYS[i % LATE_PICKUP_DELAYS.length];
		const pickupKey = shiftDateKey(today, -delay, "retrait dépassé");
		const returnKey = shiftDateKey(
			pickupKey,
			option.duration - 1,
			"retrait dépassé",
		);

		reservations.push(
			makeReservation({
				userIndex: GROUP_SIZE * 3 + i,
				variant,
				option,
				pickupKey,
				returnKey,
				status: "CONFIRMED",
			}),
		);
	}

	// 5. No-show aboutis : CANCELLED, retrait prévu il y a 3, 7 et 14 jours et
	//    jamais effectué. Invisibles des tableaux du jour, ils portent le badge
	//    « Non présenté » sur la fiche client et la fiche réservation.
	for (let i = 0; i < NO_SHOW_COUNT; i++) {
		const variant = variantAt(GROUP_SIZE * 4 + i);
		const option = variant.options[i % variant.options.length];
		const delay = NO_SHOW_DELAYS[i];
		const pickupKey = shiftDateKey(today, -delay, "no-show abouti");
		const returnKey = shiftDateKey(
			pickupKey,
			option.duration - 1,
			"no-show abouti",
		);

		reservations.push(
			makeReservation({
				userIndex: GROUP_SIZE * 4 + i,
				variant,
				option,
				pickupKey,
				returnKey,
				status: "CANCELLED",
				isNoShow: true,
			}),
		);
	}

	await db.insert(schema.reservations).values(reservations.map((r) => r.row));
	await db.insert(schema.reservationItems).values(
		reservations.flatMap((r) =>
			r.lineItems.map((line) => ({
				...line,
				reservationId: r.row.id as string,
			})),
		),
	);

	console.log(
		`✅ ${reservations.length} réservations de démo créées ` +
			`(${GROUP_SIZE} à prélever aujourd'hui, ${GROUP_SIZE} à rendre aujourd'hui, ` +
			`${GROUP_SIZE} retours en retard de 1 à ${LATE_RETURN_DELAYS.at(-1)} j, ` +
			`${GROUP_SIZE} retraits dépassés de 1 à ${LATE_PICKUP_DELAYS.at(-1)} j, ` +
			`${NO_SHOW_COUNT} no-show aboutis).`,
	);

	await pool.end();
	process.exit(0);
}

main().catch(async (err) => {
	console.error("❌ Erreur lors du seed de démonstration :", err);
	await pool.end();
	process.exit(1);
});
