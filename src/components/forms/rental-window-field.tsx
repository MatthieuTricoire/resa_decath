import { LockIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import { RentalStartDatePicker } from "#/components/forms/rental-start-date-picker";
import { Button } from "#/components/ui/button";
import {
	type BlockedDuration,
	isOpenDay,
	type OpeningDaysSettings,
} from "#/features/reservations/opening-days";
import {
	countRentalDays,
	formatLongDate,
	rentalDurationLabel,
} from "#/lib/dates";
import { cn } from "#/lib/utils";

/**
 * Fenêtre de location « une date de départ + une durée », commune au site public
 * et à la caisse.
 *
 * Le composant est purement présentatif : il ne lit ni store ni base. Chaque
 * appelant fournit ses durées, la règle du dimanche, et les durées qu'il refuse
 * **avec la raison** de ce refus. C'est ce qui permet au site d'écrire « retour
 * le dimanche, magasin fermé » et à la caisse « aucun tarif pour ce matériel »
 * avec le même rendu : une seule implémentation de la règle, donc pas deux
 * versions qui divergent.
 *
 * La raison d'un blocage est donc toujours fournie par l'appelant, jamais déduite
 * ici. Le composant se contente de ses conséquences : griser le bouton, afficher
 * un cadenas, et ne jamais proposer une fenêtre impossible à rendre.
 *
 * `onChange` transmet une **durée** et non une date de retour. Le retour se
 * déduit toujours de la durée, et c'est l'appelant qui décide quoi faire quand la
 * durée demandée n'est plus servie (prolonger, vider la fenêtre) : cette décision
 * lui appartient, pas au rendu.
 */

/** Nom du groupe quand l'appelant ne fournit pas de titre visible. */
const DEFAULT_HEADING = "Dates de location";

/** Une durée affichée mais non sélectionnable, et la raison de son refus. */
export type { BlockedDuration as DurationBlock };

/** Nouvelle fenêtre demandée : `null` de part ou d'autre vide la fenêtre. */
export type RentalWindowChange = {
	pickupDate: string | null;
	/** Durée en jours ; `null` pour revenir à une date de départ seule. */
	durationDays: number | null;
};

export type RentalWindowFieldProps = {
	/** Clé de date `YYYY-MM-DD` du retrait, `null` si non renseignée. */
	pickupDate: string | null;
	/** Clé de date du retour, `null` si aucune durée n'est choisie. */
	returnDate: string | null;
	/** Durées à proposer, déjà triées. */
	durations: number[];
	/**
	 * Règle d'ouverture. Absente tant que les réglages chargent : aucune date
	 * n'est alors exclue, plutôt que d'en exclure de mauvaises sur la base d'une
	 * information qui n'est pas encore arrivée.
	 */
	settings?: OpeningDaysSettings;
	/** Durées refusées pour la date de retrait choisie. */
	blockedDurations?: readonly BlockedDuration[];
	/** Applique une nouvelle fenêtre. */
	onChange: (change: RentalWindowChange) => void;
	/** Remise à zéro, proposée quand une fenêtre est déjà posée. */
	onClear?: () => void;
	/** Les durées ou les réglages sont encore en cours de chargement. */
	isPending?: boolean;
	/** Message affiché quand aucune durée n'est disponible. */
	emptyMessage?: string;
	/**
	 * Titre visible du groupe. Absent, la légende reste le nom accessible du
	 * `fieldset` mais n'est pas affichée — à utiliser quand la carte qui contient
	 * le champ porte déjà un titre, pour ne pas le répéter.
	 */
	heading?: string;
	/** Précision sous les contrôles. */
	hint?: string;
	className?: string;
};

export function RentalWindowField({
	pickupDate,
	returnDate,
	durations,
	settings,
	blockedDurations,
	onChange,
	onClear,
	isPending = false,
	emptyMessage,
	heading,
	hint,
	className,
}: RentalWindowFieldProps) {
	const currentDuration =
		pickupDate && returnDate ? countRentalDays(pickupDate, returnDate) : 0;

	const blockedReasons = useMemo(
		() =>
			new Map(
				(blockedDurations ?? []).map((block) => [block.duration, block.reason]),
			),
		[blockedDurations],
	);

	const isUnavailableDate = useCallback(
		(dateKey: string) => !settings || !isOpenDay(dateKey, settings),
		[settings],
	);

	return (
		<fieldset className={cn("@container", className)}>
			{/* La légende nomme le groupe pour les lecteurs d'écran : c'est le seul
			    élément associé au `fieldset`, un titre de carte ne l'est pas. Elle
			    n'est visible que si l'appelant n'a pas déjà titré son bloc, pour ne
			    pas afficher deux fois le même mot. */}
			<legend
				className={cn(heading && "island-kicker mb-3", !heading && "sr-only")}
			>
				{heading ?? DEFAULT_HEADING}
			</legend>
			{/* La disposition suit la largeur du composant, pas celle de l'écran : dans le
			    panier le sélecteur vit dans une colonne étroite, où une règle `sm:` liée
			    au viewport écrasait le bouton de date sous le texte de retour. */}
			<div className="grid gap-3 @min-[26rem]:grid-cols-[minmax(0,1fr)_auto] @min-[26rem]:items-end">
				<div className="min-w-0 space-y-1 text-sm">
					<p className="font-semibold">Date de départ</p>
					<RentalStartDatePicker
						value={pickupDate}
						label="Date de départ"
						isUnavailableDate={isUnavailableDate}
						onChange={(next) =>
							onChange({
								pickupDate: next,
								durationDays: currentDuration || null,
							})
						}
					/>
				</div>
				<p className="min-w-0 text-sm text-[var(--sea-ink-soft)] @min-[26rem]:pb-2">
					{returnDate ? (
						<>
							Retour le{" "}
							<strong className="text-[var(--sea-ink)]">
								{formatLongDate(returnDate)}
							</strong>
						</>
					) : (
						"Choisissez une durée"
					)}
				</p>
			</div>

			<div className="mt-4">
				<div className="flex items-center justify-between gap-2">
					<p className="text-sm font-semibold">Durée</p>
					{onClear && pickupDate && (
						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="text-[var(--sea-ink-soft)]"
							onClick={onClear}
						>
							Effacer
						</Button>
					)}
				</div>
				{isPending ? (
					<p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
						Chargement des durées…
					</p>
				) : durations.length === 0 ? (
					<p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
						{emptyMessage ??
							"Aucune durée n’est encore tarifée sur ce catalogue."}
					</p>
				) : (
					<div className="mt-2 flex flex-wrap gap-2">
						{durations.map((duration) => {
							const reason = blockedReasons.get(duration);
							const selected = duration === currentDuration;
							return (
								<Button
									key={duration}
									type="button"
									size="sm"
									variant={selected ? "default" : "outline"}
									aria-pressed={selected}
									disabled={reason !== undefined}
									title={reason}
									// Cible plus haute sur mobile pour le pouce (≥ 40 px),
									// taille compacte maintenue au-dessus de 640 px.
									className="h-10 sm:h-8"
									onClick={() =>
										onChange({ pickupDate, durationDays: duration })
									}
								>
									{rentalDurationLabel(duration)}
									{reason && (
										<LockIcon className="size-3.5" aria-hidden="true" />
									)}
									{reason && <span className="sr-only"> — {reason}</span>}
								</Button>
							);
						})}
					</div>
				)}
			</div>

			{hint ? (
				<p className="mt-3 text-sm text-[var(--sea-ink-soft)]">{hint}</p>
			) : null}
		</fieldset>
	);
}
