/**
 * Lecture et écriture des réservations publiques.
 *
 * Fichier `.server.ts` : le plugin TanStack Start le retire entièrement du
 * bundle client, donc le pilote PostgreSQL ne peut pas atteindre le navigateur.
 * Rien de ce qui doit tourner côté client ne doit être exporté d'ici.
 *
 * Ces fonctions sont aussi enveloppées dans `createServerOnlyFn` : si une page
 * tente un jour de les appeler, ça échoue bruyamment au lieu de renvoyer du
 * code serveur au navigateur. `npm run check:bundle` vérifie après build
 * qu'aucun marqueur Node n'est réapparu dans `.output/public`.
 */
import { createServerOnlyFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "#/db";
import * as schema from "#/db/schema";
import {
	describeVariantAttributes,
	getPublicProduct,
} from "#/features/equipements/public-queries";
import { MAX_QUANTITY_PER_LINE } from "#/features/reservations/public.schema";
import type {
	PublicReservation,
	PublicReservationWithCodes,
	ReserveInput,
} from "#/features/reservations/public-queries";
import {
	countRentalDays,
	dateKeyToUtcNoon,
	rentalDurationLabel,
} from "#/lib/dates";
import { isValidAccessToken } from "#/lib/reservation-reference";

/** Résout et revalide chaque ligne : le panier client n'est jamais fiable. */
export const resolveLines = createServerOnlyFn(async (input: ReserveInput) => {
	const durationDays = countRentalDays(input.pickupDate, input.returnDate);
	const pickup = dateKeyToUtcNoon(input.pickupDate);
	const returnDate = dateKeyToUtcNoon(input.returnDate);
	if (!pickup || !returnDate || durationDays < 1) {
		throw new Error("Dates de réservation invalides");
	}

	const merged = new Map<string, number>();
	for (const line of input.lines) {
		const key = `${line.productSlug}:${line.variantId}:${line.priceOptionId}`;
		merged.set(key, (merged.get(key) ?? 0) + line.quantity);
	}
	if (
		[...merged.values()].some((quantity) => quantity > MAX_QUANTITY_PER_LINE)
	) {
		throw new Error("Quantité maximale dépassée pour un matériel");
	}

	const resolved = [];
	for (const line of input.lines) {
		const product = await getPublicProduct({ data: line.productSlug });
		if (!product) {
			throw new Error("Matériel introuvable dans le catalogue");
		}
		const variant = product.variants.find(
			(candidate) => candidate.id === line.variantId,
		);
		if (!variant || !variant.bookable) {
			throw new Error(`« ${product.name} » n’est pas réservable en ligne`);
		}

		if (!line.priceOptionId) {
			throw new Error(`« ${product.name} » exige un tarif par durée`);
		}
		const option = variant.priceOptions.find(
			(candidate) => candidate.id === line.priceOptionId,
		);
		if (!option) {
			throw new Error(`Tarif indisponible pour « ${product.name} »`);
		}
		if (option.duration !== durationDays) {
			throw new Error(
				`« ${product.name} » n’est pas disponible pour ${rentalDurationLabel(durationDays)} (tarif attendu : ${rentalDurationLabel(option.duration)})`,
			);
		}
		resolved.push({
			variantId: line.variantId,
			priceOptionId: option.id,
			quantity: line.quantity,
		});
	}

	return { durationDays, pickup, returnDate, resolved };
});

/** Client public : ligne `user` sans `account` ni mot de passe. */
export const upsertPublicUser = createServerOnlyFn(
	async (input: {
		firstName: string;
		lastName: string;
		email: string;
		phone: string;
		loyaltyCard?: string;
	}): Promise<string> => {
		const [existing] = await db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				phone: schema.user.phone,
			})
			.from(schema.user)
			.where(eq(schema.user.email, input.email));

		const now = new Date();
		if (existing) {
			await db
				.update(schema.user)
				.set({
					name: `${input.firstName} ${input.lastName}`.trim(),
					phone: input.phone,
					loyaltyCard: input.loyaltyCard || null,
					updatedAt: now,
				})
				.where(eq(schema.user.id, existing.id));
			return existing.id;
		}

		const id = crypto.randomUUID();
		await db.insert(schema.user).values({
			id,
			name: `${input.firstName} ${input.lastName}`.trim(),
			email: input.email,
			phone: input.phone,
			loyaltyCard: input.loyaltyCard || null,
			emailVerified: false,
			role: "user",
			image: null,
			createdAt: now,
			updatedAt: now,
		});
		return id;
	},
);

/**
 * Confirmation publique : lecture par référence + jeton, sans session.
 * Le jeton n'est jamais renvoyé par une autre route que celle-ci.
 *
 * Fonction plate plutôt que `createServerFn` : l'email de confirmation relit la
 * réservation par exactement la même requête que la page, pour que le récapitulatif
 * mailed et le récapitulatif affiché ne puissent pas diverger.
 */
export const fetchPublicReservation = createServerOnlyFn(
	async (data: {
		reference: string;
		token: string;
	}): Promise<PublicReservation | null> => {
		if (!isValidAccessToken(data.token)) return null;
		const [reservation] = await db
			.select({
				reference: schema.reservations.reference,
				accessToken: schema.reservations.accessToken,
				pickupDate: schema.reservations.pickupDate,
				returnDate: schema.reservations.returnDate,
				totalPrice: schema.reservations.totalPrice,
				status: schema.reservations.status,
				id: schema.reservations.id,
				firstName: schema.user.name,
				email: schema.user.email,
				phone: schema.user.phone,
			})
			.from(schema.reservations)
			.innerJoin(schema.user, eq(schema.reservations.userId, schema.user.id))
			.where(
				and(
					eq(schema.reservations.reference, data.reference),
					eq(schema.reservations.accessToken, data.token),
				),
			);
		if (!reservation) return null;

		const lines = await db
			.select({
				id: schema.reservationItems.id,
				variantId: schema.reservationItems.variantId,
				priceOptionId: schema.reservationItems.priceOptionId,
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

		// Attributs des variantes concernées : sans eux deux variantes d'un même
		// produit seraient indiscernables sur le récapitulatif.
		const attributeRows = lines.length
			? await db
					.select({
						variantId: schema.variantAttributes.variantId,
						name: schema.variantAttributes.name,
						value: schema.variantAttributes.value,
					})
					.from(schema.variantAttributes)
					.where(
						inArray(schema.variantAttributes.variantId, [
							...new Set(lines.map((line) => line.variantId)),
						]),
					)
			: [];
		const attributesByVariant = new Map<
			string,
			Array<{ name: string; value: string }>
		>();
		for (const attribute of attributeRows) {
			const list = attributesByVariant.get(attribute.variantId) ?? [];
			list.push({ name: attribute.name, value: attribute.value });
			attributesByVariant.set(attribute.variantId, list);
		}

		const nameParts = (reservation.firstName ?? "").split(" ");
		const durationDays = countRentalDays(
			reservation.pickupDate.toISOString().slice(0, 10),
			reservation.returnDate.toISOString().slice(0, 10),
		);
		return {
			reference: reservation.reference,
			accessToken: data.token,
			firstName: nameParts[0] ?? "",
			lastName: nameParts.slice(1).join(" "),
			email: reservation.email,
			phone: reservation.phone ?? "",
			pickupDate: reservation.pickupDate.toISOString().slice(0, 10),
			returnDate: reservation.returnDate.toISOString().slice(0, 10),
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
	},
);

/**
 * Ajoute à une réservation ses codes de retrait, prêts à afficher.
 *
 * Les images sont rendues ici, sur le serveur, par le générateur unique de
 * `#/lib/codes` : le codebarres de la page et celui du mail sont donc
 * identiques. Aucun codebarres ne part côté client, donc la page n'ajoute
 * aucune dépendance à son bundle.
 */
export const withWithdrawalCodes = createServerOnlyFn(
	async (
		reservation: PublicReservation,
	): Promise<PublicReservationWithCodes> => {
		const { renderCodes, pngDataUri } = await import("#/lib/codes");
		const rendered = await renderCodes(
			reservation.lines.map((line) => line.barcode),
		);
		const codes: PublicReservationWithCodes["codes"] = {};
		for (const [barcode, images] of rendered) {
			codes[barcode] = {
				...(images.code128
					? {
							code128: {
								src: pngDataUri(images.code128.buffer),
								width: images.code128.width,
								height: images.code128.height,
							},
						}
					: {}),
			};
		}
		return { ...reservation, codes };
	},
);

/**
 * Relit la réservation par la même requête que la page de confirmation, puis
 * envoie le récapitulatif. Les erreurs sont attrapées ici : un email en échec
 * laisse une réservation valide et un client qui reçoit sa confirmation.
 *
 * Le module email est importé dynamiquement : il ne dépend que du code serveur,
 * et `bwip-js` ne se retrouve ainsi ni dans le bundle client, ni dans le chemin
 * d'une réservation dont l'email ne part pas.
 */
export const notifyReservationConfirmation = createServerOnlyFn(
	async (reference: string, accessToken: string): Promise<void> => {
		try {
			const data = await fetchPublicReservation({
				reference,
				token: accessToken,
			});
			if (!data) {
				console.error(
					`✉️ [EMAIL] Réservation ${reference} introuvable après écriture — email non envoyé`,
				);
				return;
			}
			const { sendReservationConfirmationEmail } = await import(
				"#/lib/email/reservation-email"
			);
			await sendReservationConfirmationEmail(data);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			console.error(
				`✉️ [EMAIL] Réservation ${reference} confirmée mais email non envoyé — ${reason}`,
			);
		}
	},
);
