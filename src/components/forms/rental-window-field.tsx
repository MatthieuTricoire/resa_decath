import { type ReactNode, useCallback, useMemo } from "react";
import { RentalStartDatePicker } from "#/components/forms/rental-start-date-picker";
import { DurationPicker } from "#/components/forms/rental-window/duration-picker";
import { ReturnDateReadout } from "#/components/forms/rental-window/return-date-readout";
import { Button } from "#/components/ui/button";
import {
	type BlockedDuration,
	isOpenDay,
	type OpeningDaysSettings,
} from "#/features/reservations/opening-days";
import { countRentalDays } from "#/lib/dates";
import { cn } from "#/lib/utils";

/**
 * Fenêtre de location « une date de départ + une durée », commune au site public
 * et à la caisse.
 *
 * Le composant est purement présentatif : il ne lit ni store ni base. Chaque
 * appelant fournit ses durées, la règle d'ouverture, et les durées qu'il refuse
 * **avec la raison** de ce refus. La raison d'un blocage est toujours fournie par
 * l'appelant, jamais déduite ici : le composant se contente d'en tirer les
 * conséquences (griser le bouton, afficher un cadenas).
 *
 * `durationNote` est l'emplacement de la remarque qui explique ces boutons
 * grisés, rendue juste sous eux. Son contenu et son existence restent la
 * décision de l'appelant.
 *
 * `onChange` transmet une **durée** et non une date de retour : le retour se
 * déduit toujours de la durée, et c'est l'appelant qui décide quoi faire quand la
 * durée demandée n'est plus servie (prolonger, vider la fenêtre).
 */

const DEFAULT_HEADING = "Dates de location";

export type { BlockedDuration as DurationBlock };

export type RentalWindowChange = {
	pickupDate: string | null;
	durationDays: number | null;
};

export type RentalWindowFieldProps = {
	pickupDate: string | null;
	returnDate: string | null;
	durations: number[];
	settings?: OpeningDaysSettings;
	blockedDurations?: readonly BlockedDuration[];
	durationNote?: ReactNode;
	onChange: (change: RentalWindowChange) => void;
	onClear?: () => void;
	isPending?: boolean;
	emptyMessage?: string;
	heading?: string;
	minDateKey?: string;
	hint?: string;
	className?: string;
};

export function RentalWindowField({
	pickupDate,
	returnDate,
	durations,
	settings,
	blockedDurations,
	durationNote,
	onChange,
	onClear,
	isPending = false,
	emptyMessage,
	heading,
	hint,
	minDateKey,
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
			<legend
				className={cn(heading && "island-kicker mb-3", !heading && "sr-only")}
			>
				{heading ?? DEFAULT_HEADING}
			</legend>

			<div className="grid gap-5">
				{/* Date de départ */}
				<div className="space-y-1.5 text-sm">
					<p className="font-semibold">Date de départ</p>
					<RentalStartDatePicker
						value={pickupDate}
						label="Date de départ"
						isUnavailableDate={isUnavailableDate}
						minDateKey={minDateKey}
						onChange={(next) =>
							onChange({
								pickupDate: next,
								durationDays: currentDuration || null,
							})
						}
					/>
				</div>

				{/* Sélection de durée et note explicative groupées */}
				<div className="space-y-2">
					<div className="flex items-center justify-between gap-2">
						<p className="text-sm font-semibold">Durée</p>
						{onClear && pickupDate && (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="h-7 px-2 text-xs text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
								onClick={onClear}
							>
								Effacer
							</Button>
						)}
					</div>

					{isPending ? (
						<p className="text-sm text-[var(--sea-ink-soft)]">
							Chargement des durées…
						</p>
					) : durations.length === 0 ? (
						<p className="text-sm text-[var(--sea-ink-soft)]">
							{emptyMessage ??
								"Aucune durée de location n’est proposée pour le moment."}
						</p>
					) : (
						<DurationPicker
							durations={durations}
							currentDuration={currentDuration}
							blockedReasons={blockedReasons}
							onPick={(duration) =>
								onChange({ pickupDate, durationDays: duration })
							}
						/>
					)}

					{/* La remarque sur les durées grisées se cale sous les boutons */}
					{durationNote && <div className="pt-0.5">{durationNote}</div>}
				</div>

				{returnDate && <ReturnDateReadout returnDate={returnDate} />}
			</div>

			{hint && (
				<p className="mt-3 text-xs leading-relaxed text-[var(--sea-ink-soft)]">
					{hint}
				</p>
			)}
		</fieldset>
	);
}
