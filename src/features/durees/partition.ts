/**
 * Répartition des options de tarif d'une durée que l'on s'apprête à supprimer.
 *
 * Une option déjà facturée ne peut pas être détruite : `reservation_items`
 * pointe dessus par clé étrangère, et briser ce lien effacerait la trace d'une
 * réservation. On la passe en inactive — elle quitte le catalogue, la caisse et
 * la fiche article, mais reste lisible pour l'historique.
 *
 * Une option jamais facturée, elle, est supprimée : l'article retrouve exactement
 * l'état qu'il avait avant la création de la durée, sans fantôme à ressortir.
 *
 * Le tri se fait ici, hors base, pour pouvoir être testé : le serveur ne fait
 * qu'exécuter ce qu'il a décidé.
 */
export type PartitionedPriceOptions = {
	/** Options à supprimer : aucune réservation ne les a utilisées. */
	toDelete: string[];
	/** Options à conserver en archive (`isActive = false`). */
	toArchive: string[];
};

export function partitionPriceOptions({
	optionIds,
	referencedIds,
}: {
	/** Id des options de tarif portant la durée supprimée. */
	optionIds: readonly string[];
	/** Id de ces options déjà portées par une réservation. */
	referencedIds: readonly string[];
}): PartitionedPriceOptions {
	const referenced = new Set(referencedIds);
	return {
		toDelete: optionIds.filter((id) => !referenced.has(id)),
		toArchive: optionIds.filter((id) => referenced.has(id)),
	};
}
