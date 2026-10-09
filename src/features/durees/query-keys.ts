export const queryKeys = {
	durees: {
		all: ["durees"] as const,
	},
	/**
	 * Durées du catalogue telles que les lit le site public.
	 *
	 * Elles viennent des options de tarif, pas de `rental_durations`, mais elles
	 * portent la même clé ici pour qu'une écriture sur les durées (ajout,
	 * suppression) puisse invalider les deux lectures d'un seul geste.
	 */
	publicDurations: ["public", "rental-durations"] as const,
};
