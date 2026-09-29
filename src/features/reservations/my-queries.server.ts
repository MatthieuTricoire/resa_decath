import { createServerOnlyFn } from "@tanstack/react-start";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { getSession } from "#/features/auth/session.server";
import { describeVariantAttributes } from "#/features/equipements/public-queries";
import type {
	PublicReservation,
	PublicReservationWithCodes,
} from "#/features/reservations/public-queries";
import { withWithdrawalCodes } from "#/features/reservations/public-queries.server";
import { countRentalDays, todayInParis } from "#/lib/dates";

/**
 * Espace client : les réservations de la personne connectée.
 *
 * Fichier `.server.ts`, comme `public-queries.server.ts` : tout ce qui touche la
 * base est retiré du bundle client, sinon le pilote PostgreSQL part dans le
 * navigateur et la page casse sur `Buffer is not defined`.
 *
 * Point de sécurité central : chaque fonction part de `getSession()` et filtre
 * sur `reservations.userId`. La preuve de propriété n'est PAS le couple
 * référence + jeton utilisé par `fetchPublicReservation` — c'est un lien qui
 * circule par mail et se copie. Ici, c'est la session. On ne réutilise donc pas
 * `fetchPublicReservation` : la fonction serait en double, et le jour où
 * quelqu'en modifierait le filtre, ce serait une fuite d'historique client.
 */

/** Statuts qui immobilisent du matériel : même source que le calcul de stock. */
const ACTIVE_STATUSES = ["CONFIRMED", "COLLECTED"] as const;

/** Une ligne de réservation, telle qu'affichée dans la liste du compte. */
export type MyReservationLine = {
	key: string;
	itemName: string;
	variantLabel: string | null;
	quantity: number;
	/**
	 * Fiche produit vers laquelle renvoyer, ou `null` quand la variante n'est
	 * plus réservable.
	 *
	 * On ne renvoie jamais vers le panier : la disponibilité se recalcule à chaque
	 * demande selon les dates, et un matériel retiré du catalogue doit se voir
	 *Amené vers la fiche produit, qui l'expliquera, plutôt que vers un lien qui
	 * échoue à la commande.
	 */
	href: string | null;
};

export type MyReservationSummary = {
	id: string;
	reference: string;
	status: string;
	pickupDate: string;
	returnDate: string;
	totalPrice: string;
	lines: MyReservationLine[];
	totalQuantity: number;
	/** Matériel encore sorti, date de retour dépassée. */
	overdue: boolean;
};

/**
 * Session obligatoire, ou échec.
 *
 * `createServerOnlyFn` plutôt qu'un simple `try/catch` : une fonction d'auth
 * appelée depuis une page ne doit jamais pouvoir revenir au navigateur avec
 * une donnée d'un autre client.
 */
const requireUser = createServerOnlyFn(async () => {
	const session = await getSession();
	if (!session?.user?.id) {
		throw new Error("Connectez-vous pour accéder à vos locations.");
	}
	return session.user.id;
});

function toDateKey(value: Date): string {
	return value.toISOString().slice(0, 10);
}

/**
 * Les réservations du client, coupées en deux : ce qui l'intéresse maintenant,
 * puis le reste.
 *
 * « En cours » ne dépend que du statut, et c'est volontaire. Le statut est la
 * vérité du magasin : tant qu'une réservation est `COLLECTED`, le matériel est
 * sorti, quelle que soit la date. Filtrer aussi sur la date ferait disparaître
 * une location en retard de la liste principale — exactement le cas qu'un client
 * a besoin de voir. La date ne sert qu'à signaler le retard.
 *
 * Deux requêtes plutôt qu'une grande jointure : sans les articles, la jointure
 * dupliquerait chaque réservation sur le nombre de ses lignes. On ramène les
 * commandes, puis leurs lignes d'un coup, et on les recolle ici.
 */
export const getMyReservations = createServerOnlyFn(
	async (): Promise<{
		current: MyReservationSummary[];
		past: MyReservationSummary[];
	}> => {
		const userId = await requireUser();

		const reservations = await db
			.select({
				id: schema.reservations.id,
				reference: schema.reservations.reference,
				status: schema.reservations.status,
				pickupDate: schema.reservations.pickupDate,
				returnDate: schema.reservations.returnDate,
				totalPrice: schema.reservations.totalPrice,
			})
			.from(schema.reservations)
			.where(eq(schema.reservations.userId, userId))
			.orderBy(desc(schema.reservations.pickupDate));

		if (reservations.length === 0) return { current: [], past: [] };

		const lines = await db
			.select({
				reservationId: schema.reservationItems.reservationId,
				lineId: schema.reservationItems.id,
				itemName: schema.items.name,
				quantity: schema.reservationItems.quantity,
				variantId: schema.reservationItems.variantId,
				variantStatus: schema.itemVariants.status,
				productSlug: schema.items.slug,
				activitySlug: schema.categories.slug,
			})
			.from(schema.reservationItems)
			.innerJoin(
				schema.itemVariants,
				eq(schema.reservationItems.variantId, schema.itemVariants.id),
			)
			.innerJoin(schema.items, eq(schema.itemVariants.itemId, schema.items.id))
			.innerJoin(
				schema.categories,
				eq(schema.items.categoryId, schema.categories.id),
			)
			.where(
				inArray(
					schema.reservationItems.reservationId,
					reservations.map((reservation) => reservation.id),
				),
			);

		// Deux variantes d'un même produit sont indiscernables sans leurs attributs.
		const attributesByVariant = await variantAttributes(
			lines.map((line) => line.variantId),
		);

		const linesByReservation = new Map<string, MyReservationLine[]>();
		for (const line of lines) {
			const list = linesByReservation.get(line.reservationId) ?? [];
			list.push({
				key: line.lineId,
				itemName: line.itemName,
				variantLabel: describeVariantAttributes(
					attributesByVariant.get(line.variantId) ?? [],
				),
				quantity: line.quantity,
				href:
					line.variantStatus === "AVAILABLE"
						? `/activite/${line.activitySlug}/${line.productSlug}`
						: null,
			});
			linesByReservation.set(line.reservationId, list);
		}

		const today = todayInParis();
		const current: MyReservationSummary[] = [];
		const past: MyReservationSummary[] = [];
		for (const reservation of reservations) {
			const reservationLines = linesByReservation.get(reservation.id) ?? [];
			const isCurrent = (ACTIVE_STATUSES as readonly string[]).includes(
				reservation.status,
			);
			const returnDate = toDateKey(reservation.returnDate);
			const summary: MyReservationSummary = {
				id: reservation.id,
				reference: reservation.reference,
				status: reservation.status,
				pickupDate: toDateKey(reservation.pickupDate),
				returnDate,
				totalPrice: reservation.totalPrice,
				lines: reservationLines,
				totalQuantity: reservationLines.reduce(
					(total, line) => total + line.quantity,
					0,
				),
				// Matériel encore sorti et date de retour dépassée : la location
				// reste « en cours », mais signalée comme en retard.
				overdue: isCurrent && returnDate < today,
			};
			(isCurrent ? current : past).push(summary);
		}
		return { current, past };
	},
);

/** Attributs de variantes, groupés par variante. */
async function variantAttributes(variantIds: string[]) {
	const unique = [...new Set(variantIds)];
	if (unique.length === 0) return new Map();
	const rows = await db
		.select({
			variantId: schema.variantAttributes.variantId,
			name: schema.variantAttributes.name,
			value: schema.variantAttributes.value,
		})
		.from(schema.variantAttributes)
		.where(inArray(schema.variantAttributes.variantId, unique));

	const grouped = new Map<string, Array<{ name: string; value: string }>>();
	for (const row of rows) {
		const list = grouped.get(row.variantId) ?? [];
		list.push({ name: row.name, value: row.value });
		grouped.set(row.variantId, list);
	}
	return grouped;
}

/**
 * Le détail d'une réservation du client, codes de retrait compris.
 *
 * Le contrôle de propriété est dans le `WHERE`, pas dans un test JavaScript
 * ensuite : une réservation qui n'est pas à la personne connectée ne renvoie
 * rien, exactement comme si elle n'existait pas.
 */
export const getMyReservationWithCodes = createServerOnlyFn(
	async (id: string): Promise<PublicReservationWithCodes | null> => {
		const userId = await requireUser();

		const [reservation] = await db
			.select({
				id: schema.reservations.id,
				reference: schema.reservations.reference,
				status: schema.reservations.status,
				pickupDate: schema.reservations.pickupDate,
				returnDate: schema.reservations.returnDate,
				totalPrice: schema.reservations.totalPrice,
				firstName: schema.user.name,
				email: schema.user.email,
				phone: schema.user.phone,
			})
			.from(schema.reservations)
			.innerJoin(schema.user, eq(schema.reservations.userId, schema.user.id))
			.where(
				and(
					eq(schema.reservations.id, id),
					eq(schema.reservations.userId, userId),
				),
			);
		if (!reservation) return null;

		const lines = await db
			.select({
				variantId: schema.reservationItems.variantId,
				label: schema.reservationItems.label,
				quantity: schema.reservationItems.quantity,
				unitPrice: schema.reservationItems.priceAppliedAtReservation,
				barcode: schema.priceOptions.barcode,
				duration: schema.priceOptions.duration,
				itemName: schema.items.name,
			})
			.from(schema.reservationItems)
			.innerJoin(
				schema.itemVariants,
				eq(schema.reservationItems.variantId, schema.itemVariants.id),
			)
			.innerJoin(schema.items, eq(schema.itemVariants.itemId, schema.items.id))
			.leftJoin(
				schema.priceOptions,
				eq(schema.reservationItems.priceOptionId, schema.priceOptions.id),
			)
			.where(eq(schema.reservationItems.reservationId, reservation.id));

		const attributesByVariant = await variantAttributes(
			lines.map((line) => line.variantId),
		);

		const nameParts = (reservation.firstName ?? "").split(" ");
		const durationDays = countRentalDays(
			toDateKey(reservation.pickupDate),
			toDateKey(reservation.returnDate),
		);

		const detail: PublicReservation = {
			reference: reservation.reference,
			accessToken: "",
			firstName: nameParts[0] ?? "",
			lastName: nameParts.slice(1).join(" "),
			email: reservation.email,
			phone: reservation.phone ?? "",
			pickupDate: toDateKey(reservation.pickupDate),
			returnDate: toDateKey(reservation.returnDate),
			durationDays,
			status: reservation.status,
			totalPrice: reservation.totalPrice,
			lines: lines.map((line) => ({
				label: line.label ?? line.itemName,
				itemName: line.itemName,
				variantLabel: describeVariantAttributes(
					attributesByVariant.get(line.variantId) ?? [],
				),
				// Une commande n'a qu'une fenêtre : l'option de prix réservée est donc
				// censée porter la même durée, sinon on retombe sur celle de la commande.
				durationDays: line.duration ?? durationDays,
				quantity: line.quantity,
				unitPrice: line.unitPrice,
				barcode: line.barcode ?? "",
			})),
		};

		return withWithdrawalCodes(detail);
	},
);
