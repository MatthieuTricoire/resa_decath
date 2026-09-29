import { z } from "zod";

/**
 * Bornes du panier public, partagées par la validation du formulaire, le
 * schéma du serveur et la revalidation des lignes au moment de la réservation.
 *
 * Elles vivent ici, et pas dans un `.server.ts` : le module est chargé par le
 * navigateur, et une valeur exportée depuis un fichier serveur y vaudrait
 * `undefined`.
 */
export const MAX_LINES = 20;
export const MAX_QUANTITY_PER_LINE = 10;

/** Validation partagée client/serveur du formulaire de réservation publique. */
export const publicReservationSchema = z.object({
	firstName: z.string().trim().min(1, "Le prénom est requis").max(80),
	lastName: z.string().trim().min(1, "Le nom est requis").max(80),
	email: z.string().trim().toLowerCase().email("Email invalide").max(160),
	phone: z
		.string()
		.trim()
		.min(6, "Téléphone invalide")
		.max(20)
		.regex(/^[0-9 +().-]+$/, "Téléphone invalide"),
	loyaltyCard: z.string().trim().max(50),
});

export type PublicReservationFormValues = z.infer<
	typeof publicReservationSchema
>;
