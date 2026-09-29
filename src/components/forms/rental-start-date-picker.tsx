import { CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { fr } from "react-day-picker/locale";
import { Button } from "#/components/ui/button";
import { Calendar } from "#/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import {
	dateKeyToUtcNoon,
	formatLongDate,
	isValidDateKey,
	todayInParis,
	toParisDateKey,
} from "#/lib/dates";
import { cn } from "#/lib/utils";

/**
 * Champ de saisie de la date de départ, commune à toute la commande.
 *
 * Une réservation n'a qu'une seule période (`reservations.pickup_date` /
 * `return_date`) : on ne saisit donc que le retrait, la durée — et donc le
 * retour — étant choisie à côté, dans `RentalWindowField`. Ce composant est
 * purement contrôlé : la date affichée est toujours celle du store ou de la
 * caisse, et le calendrier ne fait que la proposer.
 */

type RentalStartDatePickerProps = {
	/** Clé de date `YYYY-MM-DD` du jour de retrait, `null` si non renseignée. */
	value: string | null;
	onChange: (dateKey: string) => void;
	/**
	 * Cette date est-elle inexploitable ?
	 *
	 * Le calendrier ne connaît pas les jours d'ouverture : c'est l'appelant qui
	 * décide, et il doit rester cohérent avec ce que le serveur acceptera. Le
	 * prédicat est consulté pour chaque jour affiché, quelle que soit la page
	 * du mois affichée : il ne doit donc rien figer sur une plage de dates.
	 * Par défaut aucune date n'est exclue, le seul filtre restant « pas avant
	 * aujourd'hui ».
	 */
	isUnavailableDate?: (dateKey: string) => boolean;
	/** Libellé du bouton quand aucune date n'est choisie. */
	placeholder?: string;
	/** Décale le popover pour éviter qu'il ne dépasse de l'écran. */
	align?: "start" | "center" | "end";
	/** Libellé accessible du champ. */
	label?: string;
	className?: string;
};

export function RentalStartDatePicker({
	value,
	onChange,
	isUnavailableDate,
	placeholder = "Choisir une date",
	align = "start",
	label = "Date de départ",
	className,
}: RentalStartDatePickerProps) {
	const [open, setOpen] = useState(false);
	// Midi UTC : évite qu'un décalage de fuseau ne fasse glisser la date d'un
	// jour à l'affichage.
	const today = useMemo(
		() => dateKeyToUtcNoon(todayInParis()) ?? new Date(),
		[],
	);
	const selected =
		value && isValidDateKey(value)
			? (dateKeyToUtcNoon(value) ?? undefined)
			: undefined;
	const dateLabel = selected && value ? formatLongDate(value) : null;

	// `react-day-picker` appelle le prédicat pour chaque jour affiché : on garde
	// une référence stable pour ne pas refaire la comparaison à chaque rendu.
	const isUnavailable = useMemo(
		() => isUnavailableDate ?? (() => false),
		[isUnavailableDate],
	);

	return (
		<div className={cn("min-w-0", className)}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						className="w-full min-w-0 justify-start gap-2 px-3 font-normal"
						aria-label={dateLabel ? `${label} : ${dateLabel}` : label}
					>
						<CalendarIcon className="size-4 shrink-0" aria-hidden="true" />
						<span className={selected ? "font-semibold" : undefined}>
							{dateLabel ?? placeholder}
						</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align={align}>
					<Calendar
						mode="single"
						locale={fr}
						selected={selected}
						onSelect={(date) => {
							if (!date) return;
							onChange(toParisDateKey(date));
							setOpen(false);
						}}
						defaultMonth={selected ?? today}
						disabled={[
							{ before: today },
							(date: Date) => isUnavailable(toParisDateKey(date)),
						]}
						numberOfMonths={1}
						// Sélecteurs de mois et d'année : se réserver une location à
						// 2-3 mois (vacances) mérite mieux que vingt clics sur la
						// flèche de navigation.
						captionLayout="dropdown"
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
