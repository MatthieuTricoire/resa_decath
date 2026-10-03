import { Callout } from "#/components/public/shared/callout";
import { Button } from "#/components/ui/button";
import { rentalDurationLabel } from "#/lib/dates";
import { formatPrice } from "#/stores/public-cart.store";

/**
 * Rappel « cette durée n'existe pas pour ce matériel » avec les durées qui
 * existent, cliquables.
 *
 * Le catalogue ne tarifant que certaines durées par matériel, un client qui
 * arrive sur une fiche avec une fenêtre de 2 jours peut tomber sur un article
 * louable uniquement 1 ou 3 jours. Sans ce panneau, la fiche n'afficherait
 * qu'un titre et un séparateur : il faut donc nommer le problème et proposer
 * la sortie. Les prix viennent du serveur (`priceByDuration`, déjà filtré par
 * la durée minimale de l'article), ce composant n'invente aucun tarif.
 *
 * Changer de durée touche la fenêtre **de toute la commande** : l'appelant
 * prévient l'utilisateur si son panier contient déjà des lignes.
 */
export function DurationConflictNotice({
	currentDuration,
	durations,
	priceByDuration,
	onPickDuration,
}: {
	/** Durée choisie dans le sélecteur global, en jours. */
	currentDuration: number;
	/** Durées réellement tarifées pour ce matériel, triées côté serveur. */
	durations: number[];
	/** Prix le plus bas par durée, indexé par la durée. */
	priceByDuration: Record<number, number>;
	/** Applique une nouvelle durée à la fenêtre partagée. */
	onPickDuration: (durationDays: number) => void;
}) {
	return (
		<section aria-live="polite" aria-label="Durée de location indisponible">
			<Callout>
				<p className="font-semibold text-[var(--sea-ink)]">
					Non disponible sur{" "}
					{rentalDurationLabel(currentDuration).toLowerCase()}
				</p>
				{durations.length === 0 ? (
					<p className="mt-2 text-[var(--sea-ink-soft)]">
						Aucune durée n’est encore tarifée pour ce matériel. Passez au
						comptoir location du magasin.
					</p>
				) : (
					<>
						<p className="mt-2 text-[var(--sea-ink-soft)]">
							Pour ce matériel, la location est proposée en :
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							{durations.map((duration) => (
								<Button
									key={duration}
									type="button"
									size="sm"
									variant="outline"
									className="h-10 sm:h-8"
									onClick={() => onPickDuration(duration)}
								>
									{rentalDurationLabel(duration)}
									{priceByDuration[duration] !== undefined && (
										<span className="text-[var(--sea-ink-soft)]">
											· {formatPrice(priceByDuration[duration])}
										</span>
									)}
								</Button>
							))}
						</div>
					</>
				)}
			</Callout>
		</section>
	);
}
