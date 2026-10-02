import { minimumRentalDays } from "./availability";
import type { BlockedDuration } from "./opening-days";

/**
 * Règle de prix d'une variante pour une durée donnée, sans accès à la base.
 *
 * C'est la **source de vérité unique** du prix : la réservation
 * (`reserveEquipment`) et les devis publics (`getPublicWindowQuotes`,
 * `getPublicCartQuote`) passent tous deux par ici, afin qu'un prix affiché sur
 * le site et un prix encaissé au comptoir ne puissent pas diverger.
 *
 * Une réservation ayant une seule fenêtre, la durée est toujours celle de la
 * commande entière : il n'existe pas de durée par ligne.
 */

export type PriceOptionLike = {
	id: string;
	duration: number;
	label: string;
	price: string;
};

/**
 * Prix stocké en base (une chaîne numérique) lu strictement.
 *
 * `Number.parseFloat("12,00")` vaut 12 et `parseFloat("1 234,56")` vaut 1 : un
 * prix mal saisi deviendrait un montant faux, silencieusement. Un prix qui
 * n'est pas un nombre est donc traité comme absent, jamais interprété.
 */
export function parsePrice(value: string | null | undefined): number | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
	const parsed = Number.parseFloat(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

export type PricingReason =
	/** Durée nulle ou négative : rien à facturer. */
	| "invalid_duration"
	/** Aucune option de prix : le prix dépend de la durée. */
	| "price_option_required"
	/** L'option demandée n'existe pas ou n'est plus active. */
	| "unknown_price_option"
	/** Aucune option active ne correspond à la durée demandée. */
	| "duration_not_priced";

export type VariantQuote =
	| {
			status: "priced";
			priceOptionId: string | null;
			unitPrice: number;
			label: string;
	  }
	| { status: "unpriced"; reason: PricingReason };

export function quoteVariantForDuration({
	priceOptions,
	durationDays,
	priceOptionId,
}: {
	priceOptions: ReadonlyArray<PriceOptionLike>;
	durationDays: number;
	/**
	 * Option de prix déjà choisie par le client (presque toujours le cas côté
	 * caisse). Si elle est fournie, elle doit exister, être active et coller à
	 * la durée ; sinon la fenêtre est résolue par durée, comme pour un devis.
	 */
	priceOptionId?: string | null;
}): VariantQuote {
	if (!Number.isInteger(durationDays) || durationDays < 1) {
		return { status: "unpriced", reason: "invalid_duration" };
	}

	if (!priceOptionId) {
		const byDuration = priceOptions.find(
			(option) => option.duration === durationDays,
		);
		if (!byDuration) {
			return { status: "unpriced", reason: "duration_not_priced" };
		}
		const price = parsePrice(byDuration.price);
		if (price === null) {
			return { status: "unpriced", reason: "unknown_price_option" };
		}
		return {
			status: "priced",
			priceOptionId: byDuration.id,
			unitPrice: price,
			label: byDuration.label,
		};
	}

	const requested = priceOptions.find((option) => option.id === priceOptionId);
	if (!requested) {
		return { status: "unpriced", reason: "unknown_price_option" };
	}
	if (requested.duration !== durationDays) {
		return { status: "unpriced", reason: "duration_not_priced" };
	}
	const price = parsePrice(requested.price);
	if (price === null) {
		return { status: "unpriced", reason: "unknown_price_option" };
	}
	return {
		status: "priced",
		priceOptionId: requested.id,
		unitPrice: price,
		label: requested.label,
	};
}

/* -------------------------------------------------------------------------- */
/* Durées vendues : ce qu'un produit peut réellement facturer                  */
/* -------------------------------------------------------------------------- */

export type ProductDurationSupport = {
	/**
	 * Durées couvertes par une option de prix active, une fois la durée
	 * minimale de l'article respectée. Liste finie, donc envoyable au client.
	 */
	durations: number[];
	/** Prix le plus bas par durée, parmi les options actives et tarifables. */
	priceByDuration: Record<number, number>;
};

/**
 * Ce qu'un produit peut facturer, sans accès à la base.
 *
 * Miroir exact de ce que `reserveEquipment` refusera : une option de prix
 * illisible est ignorée, et une durée antérieure au minimum de l'article
 * disparaît. Le catalogue public s'en sert pour griser les articles qui ne
 * couvrent pas la fenêtre choisie, au lieu de laisser le client découvrir le
 * refus au panier.
 *
 * Chaque durée vendue porte son prix et son code-barres : il n'existe qu'un
 * seul régime de tarification, « par durée ».
 */
export function productDurationSupport({
	priceOptions,
	minDuration = 0,
}: {
	/** Options actives des variantes réservables du produit. */
	priceOptions: ReadonlyArray<PriceOptionLike>;
	minDuration?: number | null;
}): ProductDurationSupport {
	const minimum = minimumRentalDays(minDuration);
	const durations = new Set<number>();
	const priceByDuration: Record<number, number> = {};

	for (const option of priceOptions) {
		if (option.duration < 1 || option.duration < minimum) continue;
		const price = parsePrice(option.price);
		if (price === null) continue;
		durations.add(option.duration);
		const known = priceByDuration[option.duration];
		priceByDuration[option.duration] =
			known === undefined ? price : Math.min(known, price);
	}

	return {
		durations: [...durations].sort((a, b) => a - b),
		priceByDuration,
	};
}

/** Le produit vend-il cette durée ? Règle client, même logique que le serveur. */
export function supportsDuration(
	support: ProductDurationSupport,
	durationDays: number,
): boolean {
	if (!Number.isInteger(durationDays) || durationDays < 1) return false;
	return support.priceByDuration[durationDays] !== undefined;
}

/**
 * Durées affichées que ce matériel ne vend pas, avec le motif de leur refus.
 *
 * Complément de `closedReturnDurations`, qui ne connaît que les jours
 * d'ouverture : ici le refus vient du catalogue de l'article, pas du magasin. Le
 * site public (fiche produit) et la caisse s'en servent tous les deux, pour que
 * « aucun tarif 2j pour ce matériel » ne se dise jamais de deux façons.
 *
 * Le motif ne dépend pas de la date de retrait, contrairement à la fermeture : un
 * bouton peut donc être refusé avant même qu'une date soit choisie.
 *
 * `alreadyBlocked` porte les durées déjà refusées pour un autre motif. Une durée
 * n'affiche qu'une raison — deux sur le même bouton n'en expliqueraient qu'une à
 * l'écran, celle déjà rendue l'emporte.
 */
export function unpricedDurations({
	durations,
	support,
	alreadyBlocked = [],
}: {
	/** Durées affichées à l'écran, catalogue à l'échelle de la commande. */
	durations: readonly number[];
	/** Ce que le matériel sait facturer. */
	support: ProductDurationSupport;
	/** Durées déjà refusées, à laisser avec la raison qui les a écartées. */
	alreadyBlocked?: readonly number[];
}): BlockedDuration[] {
	const elsewhere = new Set(alreadyBlocked);
	return durations
		.filter(
			(duration) =>
				!supportsDuration(support, duration) && !elsewhere.has(duration),
		)
		.map((duration) => ({
			duration,
			reason: `aucun tarif ${duration}j pour ce matériel`,
		}));
}

/**
 * Prix affiché pour une durée donnée : celui de l'option correspondante.
 *
 * Purement informatif — le prix ferme vient de `quoteVariantForDuration`, via
 * les devis puis la réservation.
 */
export function priceForDuration(
	support: ProductDurationSupport,
	durationDays: number,
): number | null {
	if (!supportsDuration(support, durationDays)) return null;
	return support.priceByDuration[durationDays];
}
