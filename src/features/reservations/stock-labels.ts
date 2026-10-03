/**
 * Libellés de comptage affichés au client. Ils ne formulent aucun refus : les
 * refus (stock insuffisant, rupture) sont rédigés par `cartLineBlocker` et par
 * les devis serveur.
 *
 * « exemplaire » se singularise tout seul, contrairement au nom du matériel.
 */
export function exemplairesLabel(count: number): string {
	return `${count} exemplaire${count > 1 ? "s" : ""}`;
}

/** « 3 exemplaires disponibles pour ces dates » ou, sans fenêtre, « 3 exemplaires en stock ». */
export function availabilityLabel(count: number, withWindow: boolean): string {
	return withWindow
		? `${exemplairesLabel(count)} disponible${count > 1 ? "s" : ""} pour ces dates`
		: `${exemplairesLabel(count)} en stock`;
}

/** « Durée minimale de 2 jours pour ce matériel. » */
export function minDurationLabel(minDuration: number): string {
	return `Durée minimale de ${minDuration} jour${minDuration > 1 ? "s" : ""} pour ce matériel.`;
}
