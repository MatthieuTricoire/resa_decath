import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
	MAX_LINES,
	MAX_QUANTITY_PER_LINE,
} from "#/features/reservations/public.schema";
import {
	fetchPublicReservation,
	notifyReservationConfirmation,
	resolveLines,
	upsertPublicUser,
	withWithdrawalCodes,
} from "#/features/reservations/public-queries.server";
import { reserveEquipment } from "#/features/reservations/reserve.server";
import { todayInParis } from "#/lib/dates";
import { generateReservationAccessToken } from "#/lib/reservation-reference";

/**
 * Réservation publique : pas de compte, pas de session, pas de paiement en
 * ligne. Le client est identifié par son email (upsert `user`) et la
 * confirmation est accessible par référence + jeton.
 *
 * Ce module ne contient que les types et les enveloppes `createServerFn`. Tout le
 * code qui touche la base vit dans `public-queries.server.ts`, que le plugin
 * TanStack Start retire du bundle client : sans cette séparation, le pilote
 * PostgreSQL part dans le navigateur et la page casse sur
 * `Buffer is not defined`.
 *
 * L'import statique du fichier `.server.ts` est volontaire et sans risque : il
 * n'est évalué que depuis l'intérieur des handlers, eux-mêmes remplacés par un
 * appel HTTP côté navigateur. C'est le même schéma que `auth/queries.ts` avec
 * `session.server.ts`.
 */

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");

const lineSchema = z.object({
	productSlug: z.string().min(1),
	variantId: z.string().min(1),
	priceOptionId: z.string().min(1).nullable(),
	quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
});

const reserveInputSchema = z
	.object({
		firstName: z.string().trim().min(1, "Le prénom est requis").max(80),
		lastName: z.string().trim().min(1, "Le nom est requis").max(80),
		email: z.string().trim().toLowerCase().email("Email invalide").max(160),
		phone: z
			.string()
			.trim()
			.min(6, "Téléphone invalide")
			.max(20)
			.regex(/^[0-9 +().-]+$/, "Téléphone invalide"),
		loyaltyCard: z.string().trim().max(50).optional(),
		pickupDate: dateKeySchema,
		returnDate: dateKeySchema,
		lines: z.array(lineSchema).min(1, "Le panier est vide").max(MAX_LINES),
	})
	.refine(
		(data) => data.pickupDate <= data.returnDate,
		"La date de retour doit être après la date de retrait",
	)
	.refine(
		(data) => data.pickupDate >= todayInParis(),
		"La date de retrait ne peut pas être dans le passé",
	);
// La coupure du jour même n'est PAS vérifiée ici : elle est modifiable par
// l'admin, et un schéma Zod statique ne peut pas lire la base. Elle est
// appliquée dans `reserve.server.ts`, qui lit les réglages — sinon le
// formulaire accepterait une date que le serveur refuse.

export type ReserveInput = z.infer<typeof reserveInputSchema>;

export type PublicReservationLine = {
	/**
	 * Libellé figé à la réservation : celui de l'option de prix réservée
	 * (« 1 jour »). Le nom du matériel vient des tables, pas de ce snapshot.
	 */
	label: string;
	/** Nom du matériel, pour que le client sache ce qu'il a réservé. */
	itemName: string;
	/** Attributs de la variante (« Taille M · Bleu »), `null` si standard. */
	variantLabel: string | null;
	/** Durée facturée pour cette ligne, en jours. */
	durationDays: number;
	quantity: number;
	unitPrice: string;
	/** Code caisse à scanner au comptoir, celui de l'option de prix réservée. */
	barcode: string;
};

export type ReserveResult = {
	reference: string;
	accessToken: string;
	pickupDate: string;
	returnDate: string;
	durationDays: number;
	totalPrice: string;
};

export type PublicReservation = ReserveResult & {
	status: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	lines: PublicReservationLine[];
};

/** Un code rendu, vu du point de vue de la page : directement affichable. */
export type PublicCodeImages = {
	code128?: { src: string; width: number; height: number };
};

export type PublicReservationWithCodes = PublicReservation & {
	/** Indexé par codebarres : une ligne de 3 bâtons partage la même image. */
	codes: Record<string, PublicCodeImages>;
};

export const reservePublicReservation = createServerFn({ method: "POST" })
	.inputValidator(reserveInputSchema.parse)
	.handler(async ({ data }): Promise<ReserveResult> => {
		const { durationDays, pickup, returnDate, resolved } =
			await resolveLines(data);

		const userId = await upsertPublicUser(data);
		const accessToken = generateReservationAccessToken();

		const reservation = await reserveEquipment({
			userId,
			pickupDate: pickup,
			returnDate,
			items: resolved,
			source: "WEB",
			accessToken,
		});

		// La réservation est écrite : l'email part après, jamais pendant. Un
		// échec d'envoi ne doit pas faire perdre la réservation, donc on
		// journalise et on rend la main au client.
		await notifyReservationConfirmation(reservation.reference, accessToken);

		return {
			reference: reservation.reference,
			accessToken,
			pickupDate: data.pickupDate,
			returnDate: data.returnDate,
			durationDays,
			totalPrice: reservation.totalPrice,
		};
	});

const publicReservationLookup = z.object({
	reference: z.string().min(1).max(20),
	token: z.string().min(1).max(64),
});

export const getPublicReservation = createServerFn({ method: "GET" })
	.inputValidator(publicReservationLookup.parse)
	.handler(async ({ data }) => fetchPublicReservation(data));

export const getPublicReservationWithCodes = createServerFn({ method: "GET" })
	.inputValidator(publicReservationLookup.parse)
	.handler(async ({ data }): Promise<PublicReservationWithCodes | null> => {
		const reservation = await fetchPublicReservation(data);
		if (!reservation) return null;
		return withWithdrawalCodes(reservation);
	});
