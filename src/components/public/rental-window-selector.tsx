import { Info } from "lucide-react";
import { useEffect, useMemo } from "react";
import {
	type RentalWindowChange,
	RentalWindowField,
} from "#/components/forms/rental-window-field";
import { deriveBlockedDurations } from "#/components/public/rental-window/blocked-durations";
import { useRentalWindow } from "#/components/public/rental-window/use-rental-window";
import type { ProductDurationSupport } from "#/features/reservations/pricing";

/**
 * Sélecteur de la fenêtre de location côté client : une date de départ, puis une
 * durée. Le rendu est délégué à `RentalWindowField`, partagé avec la caisse ;
 * les données et la pose de la fenêtre viennent de `useRentalWindow`.
 *
 * Les durées proposées sont celles que l'admin a réellement tarifées. Le retour
 * est calculé à partir de la durée, une commande n'ayant qu'une seule période.
 *
 * Règle d'ouverture : seuls le retrait et le retour doivent tomber un jour
 * ouvert, les jours intermédiaires sont libres. Une durée dont le retour
 * tomberait un jour fermé est donc grisée plutôt que proposée.
 *
 * Sur une fiche produit, `durationSupport` ajoute un second motif de refus : les
 * durées que ce matériel ne vend pas. Les boutons grisés et la remarque qui les
 * explique sont dérivés de la même liste (`deriveBlockedDurations`).
 */
export function RentalWindowSelector({
	className,
	heading = "Dates de location",
	hint = "Période valable pour l'ensemble des articles sélectionnés.",
	durationSupport,
	hideDurationNote = false,
}: {
	className?: string;
	heading?: string;
	hint?: string;
	/**
	 * Ce que le matériel affiché sait facturer. Absent quand la page n'a pas
	 * d'article en tête (accueil, panier) : seules les règles calendaires
	 * s'appliquent alors.
	 */
	durationSupport?: ProductDurationSupport;
	/** Le panier explique déjà chaque blocage par article : la remarque y serait redondante. */
	hideDurationNote?: boolean;
}) {
	const {
		pickupDate,
		returnDate,
		durationDays,
		catalogDurations,
		isDurationsPending,
		settings,
		earliestPickupDate,
		applyWindow,
	} = useRentalWindow();

	const { blockedDurations, note } = useMemo(
		() =>
			deriveBlockedDurations({
				pickupDate,
				durations: catalogDurations,
				settings,
				durationSupport,
			}),
		[catalogDurations, durationSupport, pickupDate, settings],
	);

	// Deux corrections de fenêtre restaurée : une date passée (ou devenue passée
	// après la coupure) remonte à la première date proposable, et une durée sortie
	// du catalogue est rabattue sur une durée servie plutôt que signalée par un
	// second message.
	useEffect(() => {
		if (!pickupDate) return;
		if (pickupDate < earliestPickupDate) {
			applyWindow(earliestPickupDate, durationDays);
			return;
		}
		if (
			settings &&
			durationDays > 0 &&
			catalogDurations.length > 0 &&
			!catalogDurations.includes(durationDays)
		) {
			applyWindow(pickupDate, durationDays);
		}
	}, [
		pickupDate,
		durationDays,
		earliestPickupDate,
		settings,
		catalogDurations,
		applyWindow,
	]);

	const handleChange = (change: RentalWindowChange) => {
		// Le champ refuse une durée sans date de départ, donc ce cas n'est plus
		// atteignable. On ne retombe pas sur la première date proposable : ce serait
		// choisir un retrait à la place de l'utilisateur, sur un jour de fermeture
		// compris, et la fenêtre affichée serait une date qui n'a jamais été choisie.
		if (!change.pickupDate) return;
		applyWindow(
			change.pickupDate,
			change.durationDays ?? catalogDurations[0] ?? 1,
		);
	};

	const durationNote =
		!hideDurationNote && note ? (
			<p className="mt-1.5 flex items-start gap-1.5 text-xs text-[var(--sea-ink-soft)]">
				<Info
					className="mt-0.5 size-3.5 shrink-0 opacity-70"
					aria-hidden="true"
				/>
				<span>{note}</span>
			</p>
		) : null;

	return (
		<div className={className}>
			<RentalWindowField
				heading={heading}
				hint={hint}
				pickupDate={pickupDate}
				returnDate={returnDate}
				durations={catalogDurations}
				settings={settings}
				blockedDurations={blockedDurations}
				durationNote={durationNote}
				isPending={isDurationsPending}
				minDateKey={earliestPickupDate}
				onChange={handleChange}
			/>
		</div>
	);
}
