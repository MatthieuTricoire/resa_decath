/**
 * Références de réservation lisibles par un humain, communiquées au client
 * (email, page de confirmation) et à la caisse.
 *
 * Format généré : `RES-` + 8 caractères en base32 sans caractères ambigus
 * (0/O, 1/I/L). Les 8 caractères donnent 2^40 possibilités, la contrainte
 * UNIQUE en base reste la source de vérité.
 *
 * Attention : les réservations antérieures au backfill ont reçu une référence
 * dérivée de leur uuid (`RES-` + 8 caractères hexadécimaux, donc pouvant
 * contenir `0` ou `1`, et jusqu'à 16 caractères en cas de collision). Le motif
 * de validation accepte donc ces deux formes.
 */

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const REFERENCE_LENGTH = 8;
const REFERENCE_PREFIX = "RES-";

/** Motif des références produites par `generateReservationReference`. */
export const generatedReferencePattern = new RegExp(
	`^${REFERENCE_PREFIX}[${ALPHABET}]{${REFERENCE_LENGTH}}$`,
);

/** Motif accepté pour toute référence stockée (générée ou backfillée). */
export const reservationReferencePattern = /^RES-[A-Z0-9]{8,16}$/;

function randomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	globalThis.crypto.getRandomValues(bytes);
	return bytes;
}

export function generateReservationReference(): string {
	const bytes = randomBytes(REFERENCE_LENGTH);
	let reference = REFERENCE_PREFIX;
	for (const byte of bytes) {
		reference += ALPHABET[byte % ALPHABET.length];
	}
	return reference;
}

/** Jeton d'accès de la page de confirmation publique, sans session. */
export function generateReservationAccessToken(): string {
	const bytes = randomBytes(24);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

export function isValidAccessToken(value: string | null | undefined): boolean {
	return typeof value === "string" && /^[a-f0-9]{48}$/.test(value);
}
