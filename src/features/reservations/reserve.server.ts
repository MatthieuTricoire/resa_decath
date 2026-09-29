/**
 * Écriture d'une réservation en base. Fichier `.server.ts` : le plugin TanStack
 * Start le retire entièrement du bundle client.
 *
 * Ce n'est pas une précaution théorique. `src/db` importe le pilote `postgres`,
 * dont le module fait `Buffer.allocUnsafe()` **au chargement** ; or `Buffer`
 * n'existe pas dans un navigateur. Un seul chemin menant du navigateur à cet
 * import, et la page affiche « Something went wrong! » sans que l'erreur ne
 * parle du vrai coupable. D'où le `.server.ts`, plus `createServerOnlyFn` qui
 * fait échouer bruyamment l'appel si un composant tente l'appel.
 *
 * Le garde-fou `npm run check:bundle` vérifie après build qu'aucun de ces
 * marqueurs n'est réapparu dans `dist/client`.
 */
import { createServerOnlyFn } from "@tanstack/react-start";
import { and, asc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "#/db";
import * as schema from "#/db/schema";
import {
	STOCK_CONSUMING_STATUSES as activeStatuses,
	evaluateItemAvailability,
	getReservationDurationDays,
} from "#/features/reservations/availability";
import {
	closedEndpointMessage,
	closedEndpoints,
} from "#/features/reservations/opening-days";
import {
	type PriceOptionLike,
	type PricingReason,
	quoteVariantForDuration,
} from "#/features/reservations/pricing";
import { getRentalSettingsRecord } from "#/features/settings/queries";
import { toParisDateKey } from "#/lib/dates";
import { generateReservationReference } from "#/lib/reservation-reference";

/**
 * Cœur transactionnel de réservation, partagé entre la caisse (backoffice) et
 * la réservation publique. Toute écriture de réservation doit passer par ici.
 */

const MAX_REFERENCE_ATTEMPTS = 5;

/** 23505 = unique_violation */
const PG_UNIQUE_VIOLATION = "23505";
const REFERENCE_CONSTRAINT = "reservations_reference_unique";

export type ReserveInput = {
	userId: string;
	pickupDate: Date;
	returnDate: Date;
	items: Array<{
		variantId: string;
		/** `null` pour les variantes tarifées à la journée. */
		priceOptionId?: string | null;
		quantity: number;
	}>;
	source: "STORE" | "WEB";
	accessToken?: string | null;
};

export type ReservedEquipment = typeof schema.reservations.$inferSelect;

/** Collision sur la référence uniquement : les autres violations sont remontées. */
function isReferenceCollision(error: unknown): boolean {
	const cause = (
		error as { cause?: { code?: string; constraint?: string } } | null
	)?.cause;
	if (cause?.code !== PG_UNIQUE_VIOLATION) return false;
	const constraint = cause.constraint ?? "";
	return (
		constraint === REFERENCE_CONSTRAINT || constraint.includes("reference")
	);
}

/** Messages d'erreur de tarification, identiques à ceux de la version inline. */
function pricingErrorMessage(
	reason: PricingReason,
	context: {
		variantId: string;
		itemName: string;
		durationDays: number;
		priceOptionId: string | null;
	},
): string {
	return {
		invalid_duration: "Durée de location invalide",
		price_option_required: `Cette variante exige une option de durée : ${context.variantId}`,
		unknown_price_option: `Option de prix introuvable ou inactive : ${context.priceOptionId}`,
		duration_not_priced: `L’option de prix sélectionnée ne correspond pas à la durée de ${context.durationDays} jour(s).`,
	}[reason];
}

export const reserveEquipment = createServerOnlyFn(
	async (input: ReserveInput): Promise<ReservedEquipment> => {
		const pickup = input.pickupDate;
		const returnD = input.returnDate;
		const reservationDurationDays = getReservationDurationDays(pickup, returnD);
		if (reservationDurationDays === null || reservationDurationDays < 1) {
			throw new Error("Durée de location invalide");
		}

		const requestedVariantIds = [
			...new Set(input.items.map((item) => item.variantId)),
		];
		const [settings, variants] = await Promise.all([
			getRentalSettingsRecord(),
			db
				.select({
					id: schema.itemVariants.id,
					itemName: schema.items.name,
					totalStock: schema.itemVariants.totalStock,
					status: schema.itemVariants.status,
					season: schema.items.season,
					availableFrom: schema.items.availableFrom,
					availableTo: schema.items.availableTo,
					minDuration: schema.items.minDuration,
				})
				.from(schema.itemVariants)
				.innerJoin(
					schema.items,
					eq(schema.itemVariants.itemId, schema.items.id),
				)
				.where(inArray(schema.itemVariants.id, requestedVariantIds)),
		]);
		if (variants.length !== requestedVariantIds.length) {
			throw new Error("Une des variantes sélectionnées est introuvable");
		}
		const variantById = new Map(
			variants.map((variant) => [variant.id, variant]),
		);

		// Retrait et retour doivent tomber un jour d'ouverture. Les jours au milieu
		// de la fenêtre sont libres : un dimanche fermé n'empêche pas une location du
		// samedi au lundi, seul le comptoir est fermé ce jour-là. Ce contrôle est le
		// point d'entrée unique : il vaut pour la caisse comme pour le site, dont le
		// calendrier ne fait que proposer des fenêtres déjà valides.
		const closed = closedEndpoints({
			pickupDate: toParisDateKey(pickup),
			returnDate: toParisDateKey(returnD),
			settings,
		});
		if (closed.length > 0) {
			throw new Error(closedEndpointMessage(closed[0]));
		}

		// Prix par durée : une seule requête pour toutes les variantes demandées.
		const priceOptionRows =
			variants.length > 0
				? await db
						.select({
							id: schema.priceOptions.id,
							variantId: schema.priceOptions.variantId,
							duration: schema.priceOptions.duration,
							label: schema.priceOptions.label,
							price: schema.priceOptions.price,
						})
						.from(schema.priceOptions)
						.where(
							and(
								inArray(
									schema.priceOptions.variantId,
									variants.map((variant) => variant.id),
								),
								eq(schema.priceOptions.isActive, true),
							),
						)
				: [];
		const priceOptionsByVariant = new Map<string, PriceOptionLike[]>();
		for (const option of priceOptionRows) {
			const list = priceOptionsByVariant.get(option.variantId) ?? [];
			list.push(option);
			priceOptionsByVariant.set(option.variantId, list);
		}

		for (const variant of variants) {
			const availability = evaluateItemAvailability({
				item: variant,
				settings,
				pickupDate: pickup,
				returnDate: returnD,
			});
			if (availability.available) continue;
			const message = {
				rentals_closed: "Les locations sont actuellement fermées.",
				variant_unavailable: `« ${variant.itemName} » n’est pas disponible à la location.`,
				outside_item_period: `La période de disponibilité de « ${variant.itemName} » ne couvre pas toute la réservation.`,
				below_minimum_duration: `La durée de location est trop courte pour « ${variant.itemName} ».`,
				season_not_configured: "Le calendrier saisonnier n’est pas configuré.",
				outside_active_season: `« ${variant.itemName} » n’est pas disponible pendant cette période.`,
			}[availability.reason ?? "outside_active_season"];
			throw new Error(message);
		}

		const itemsWithPrices = input.items.map((item) => {
			const variant = variantById.get(item.variantId);
			if (!variant) throw new Error("Variante introuvable");
			// Chaque ligne référence une option de prix : c'est elle qui porte le
			// montant et le code-barres transmis à la caisse.
			if (!item.priceOptionId) {
				throw new Error(
					`Cette variante exige une option de durée : ${item.variantId}`,
				);
			}

			const quote = quoteVariantForDuration({
				priceOptions: priceOptionsByVariant.get(item.variantId) ?? [],
				durationDays: reservationDurationDays,
				priceOptionId: item.priceOptionId,
			});
			if (quote.status !== "priced") {
				throw new Error(
					pricingErrorMessage(quote.reason, {
						variantId: item.variantId,
						itemName: variant.itemName,
						durationDays: reservationDurationDays,
						priceOptionId: item.priceOptionId ?? null,
					}),
				);
			}

			return {
				variantId: item.variantId,
				priceOptionId: quote.priceOptionId,
				label: quote.label,
				quantity: item.quantity,
				unitPrice: quote.unitPrice,
				priceAppliedAtReservation: String(quote.unitPrice.toFixed(2)),
			};
		});
		const totalPrice = itemsWithPrices.reduce(
			(total, item) => total + item.unitPrice * item.quantity,
			0,
		);

		const requestedQuantities = new Map<string, number>();
		for (const item of input.items) {
			requestedQuantities.set(
				item.variantId,
				(requestedQuantities.get(item.variantId) ?? 0) + item.quantity,
			);
		}

		const expiration = new Date(pickup);
		expiration.setHours(expiration.getHours() + 2);

		for (let attempt = 1; attempt <= MAX_REFERENCE_ATTEMPTS; attempt += 1) {
			const reference = generateReservationReference();
			try {
				return await db.transaction(async (tx) => {
					const lockedVariants = await tx
						.select({
							id: schema.itemVariants.id,
							totalStock: schema.itemVariants.totalStock,
						})
						.from(schema.itemVariants)
						.where(inArray(schema.itemVariants.id, requestedVariantIds))
						.orderBy(asc(schema.itemVariants.id))
						.for("update");
					if (lockedVariants.length !== requestedVariantIds.length) {
						throw new Error("Une des variantes sélectionnées est introuvable");
					}
					const lockedVariantById = new Map(
						lockedVariants.map((variant) => [variant.id, variant]),
					);

					for (const [variantId, requestedQuantity] of requestedQuantities) {
						const variant = variantById.get(variantId);
						const lockedVariant = lockedVariantById.get(variantId);
						if (!variant || !lockedVariant) {
							throw new Error("Variante introuvable");
						}
						const [{ reservedQuantity }] = await tx
							.select({
								reservedQuantity: sql<number>`COALESCE(SUM(${schema.reservationItems.quantity}), 0)::int`,
							})
							.from(schema.reservationItems)
							.innerJoin(
								schema.reservations,
								eq(
									schema.reservationItems.reservationId,
									schema.reservations.id,
								),
							)
							.where(
								and(
									eq(schema.reservationItems.variantId, variantId),
									inArray(schema.reservations.status, [...activeStatuses]),
									lt(schema.reservations.pickupDate, returnD),
									gt(schema.reservations.returnDate, pickup),
								),
							);

						const available =
							lockedVariant.totalStock - Number(reservedQuantity);
						if (requestedQuantity > available) {
							throw new Error(
								`Stock insuffisant pour « ${variant.itemName} » : ${requestedQuantity} demandé(s), ${Math.max(0, available)} disponible(s)${available >= 0 ? "" : ` (dont ${-available} en surréservation actuelle)`}`,
							);
						}
					}

					const [reservation] = await tx
						.insert(schema.reservations)
						.values({
							userId: input.userId,
							reference,
							status: "CONFIRMED",
							pickupDate: pickup,
							returnDate: returnD,
							expirationAtribute: expiration,
							totalPrice: String(totalPrice.toFixed(2)),
							source: input.source,
							accessToken: input.accessToken ?? null,
						})
						.returning();

					await tx.insert(schema.reservationItems).values(
						itemsWithPrices.map((item) => ({
							reservationId: reservation.id,
							variantId: item.variantId,
							priceOptionId: item.priceOptionId,
							label: item.label,
							quantity: item.quantity,
							priceAppliedAtReservation: item.priceAppliedAtReservation,
						})),
					);

					return reservation;
				});
			} catch (error) {
				// Collision de référence : la transaction est annulée, on réessaie.
				if (attempt < MAX_REFERENCE_ATTEMPTS && isReferenceCollision(error)) {
					continue;
				}
				throw error;
			}
		}

		throw new Error(
			"Impossible de générer une référence de réservation unique",
		);
	},
);
