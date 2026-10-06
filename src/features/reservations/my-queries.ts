import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSession } from "#/features/auth/session.server";
import {
	cancelMyReservation,
	getMyReservations,
	getMyReservationWithCodes,
	notifyReservationCancellation,
} from "#/features/reservations/my-queries.server";
import type { PublicReservationWithCodes } from "#/features/reservations/public-queries";

/**
 * Façade client de l'espace client.
 *
 * Même schéma que `public-queries.ts` / `public-queries.server.ts` : ce module
 * ne contient que des enveloppes `createServerFn`, et toute la logique vit dans
 * le fichier `.server.ts` que le plugin TanStack Start retire du bundle client.
 * Sans cette séparation, le pilote PostgreSQL partirait dans le navigateur.
 *
 * `getSession` n'est importé que pour l'être dans un handler : le plugin retire
 * ces imports du module servi au navigateur, qui ne reçoit qu'un appel HTTP.
 */

/**
 * Vue d'ensemble du compte.
 *
 * Renvoie un objet discriminé plutôt que de lever une erreur quand personne
 * n'est connecté : la page affiche une invitation à se connecter, ce qui est un
 * état normal, pas une panne.
 */
export const getMyAccount = createServerFn({ method: "GET" }).handler(
	async (): Promise<
		| { signedIn: false }
		| ({ signedIn: true } & Awaited<ReturnType<typeof getMyReservations>>)
	> => {
		const session = await getSession();
		if (!session?.user?.id) return { signedIn: false };
		return { signedIn: true, ...(await getMyReservations()) };
	},
);

const reservationIdInput = z.object({
	id: z.uuid("Identifiant de réservation invalide"),
});

/**
 * Les codes de retrait d'une réservation du client.
 *
 * Le contrôle de propriété est fait côté serveur, dans la requête : l'identifiant
 * seul ne donne accès à rien.
 */
export const getMyReservationCodes = createServerFn({ method: "POST" })
	.validator(reservationIdInput.parse)
	.handler(
		async ({ data }): Promise<PublicReservationWithCodes | null> =>
			getMyReservationWithCodes(data.id),
	);

/**
 * Annule une réservation du client connecté.
 *
 * Renvoie la référence annulée, ou `null` si rien ne l'a été : le client a alors
 * cliqué sur un bouton devenu faux — le matériel a pu être retiré entre le
 * rendu et le clic. L'appelant rafraîchit la liste dans ce cas, plutôt que
 * d'annoncer un échec : du point de vue de l'écran, il n'y a rien à signaler,
 * la carte a simplement changé d'état.
 */
export const cancelReservation = createServerFn({ method: "POST" })
	.validator(reservationIdInput.parse)
	.handler(async ({ data }): Promise<{ reference: string } | null> => {
		const cancelled = await cancelMyReservation(data.id);
		// Le mail part seulement si l'annulation a réellement eu lieu : annoncer
		// une annulation qui n'a pas eu lieu serait pire que pas de mail du tout.
		if (cancelled) {
			await notifyReservationCancellation(cancelled.reference);
		}
		return cancelled;
	});

export type {
	MyReservationLine,
	MyReservationSummary,
} from "#/features/reservations/my-queries.server";
