import { Clock } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { cn } from "#/lib/utils";

/**
 * Sélection d'une heure en `HH:MM`.
 *
 * Le champ natif `type="time"` affiche le widget du système : hors du langage
 * visuel du site, et son pas de 5 min n'est pas garanti selon les plateformes.
 * Ce composant propose une grille cliquable tout en gardant la saisie clavier,
 * ce qui est la seule façon d'atteindre un horaire qu'aucune grille ronde ne
 * contient — le dimanche du magasin ouvre à 8h45.
 *
 * La valeur est toujours `HH:MM` sur 24 h, sans zéro initial superflu côté
 * affichage. Une chaîne vide signifie « aucune heure » : un créneau incomplet
 * n'est pas un créneau à 00:00.
 */

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
/** Quart d'heure : les horaires réels sont sur ces bornes. */
const MINUTES = [0, 15, 30, 45];

export type TimePickerProps = {
	/** `HH:MM`, ou `""` si aucune heure n'est saisie. */
	value: string;
	/** Reçoit `HH:MM`, ou `""` quand la saisie est vidée. */
	onChange: (value: string) => void;
	hourFrom?: number;
	hourTo?: number;
	disabled?: boolean;
	placeholder?: string;
	/** Rend l'état vide visuellement distinct d'une heure saisie. */
	invalid?: boolean;
	className?: string;
	"aria-label"?: string;
};

function formatHour(hour: number): string {
	return String(hour).padStart(2, "0");
}

/**
 * Convertit une frappe en `HH:MM`, ou `""` si ce n'est pas une heure.
 *
 * L'utilisateur tape au fil de l'eau — « 9 », puis « 30 » — donc chaque frappe
 * intermédiaire doit rester acceptable : « 930 » se lit 9h30, pas 93h00. Une
 * saisie d'un seul chiffre n'est en revanche pas une heure finie, et l'appelant
 * décide de l'effacer au blur plutôt que de lui inventer une minute.
 */
export function normalizeTimeInput(raw: string): string {
	const digits = raw.replace(/\D/g, "");
	if (digits.length === 0) return "";
	// 3 chiffres : le premier est l'heure, les deux autres les minutes.
	const hourDigits =
		digits.length >= 3
			? digits.slice(0, digits.length - 2)
			: digits.slice(0, 2);
	const minuteDigits =
		digits.length >= 3 ? digits.slice(-2) : digits.slice(2, 4);

	const hour = Number(hourDigits);
	if (hour > 24) return "";
	if (digits.length === 1) {
		// Frappe en cours (« 9 ») : on garde l'heure, la saisie n'est pas finie.
		return `${String(hour).padStart(2, "0")}:00`;
	}
	// 24:00 est minuit, pas une heure invalide : beaucoup saisissent 2400.
	const normalizedHour = hour === 24 ? 0 : hour;
	const minute = Number(minuteDigits);
	if (minute > 59) return "";
	return `${formatHour(normalizedHour)}:${String(minute).padStart(2, "0")}`;
}

function splitValue(value: string): {
	hour: number | null;
	minute: number | null;
} {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) return { hour: null, minute: null };
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	if (hour > 23 || minute > 59) return { hour: null, minute: null };
	return { hour, minute };
}

export function TimePicker({
	value,
	onChange,
	hourFrom = 6,
	hourTo = 21,
	disabled,
	placeholder = "--:--",
	invalid,
	className,
	"aria-label": ariaLabel,
}: TimePickerProps) {
	const [open, setOpen] = useState(false);
	const baseId = useId();
	const { hour, minute } = splitValue(value);
	const hours = HOURS.filter(
		(candidate) => candidate >= hourFrom && candidate <= hourTo,
	);

	const commit = (nextHour: number, nextMinute: number) => {
		onChange(`${formatHour(nextHour)}:${String(nextMinute).padStart(2, "0")}`);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-label={ariaLabel}
					aria-invalid={invalid}
					disabled={disabled}
					className={cn(
						"w-28 justify-start font-mono tabular-nums",
						!value && "text-muted-foreground",
						className,
					)}
				>
					<Clock aria-hidden="true" />
					{value || placeholder}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-72 p-3"
				// Le champ de saisie vit dans le popover : sans cela, un horaire
				// hors grille ronde (8h45) ne serait plus saisissable.
			>
				<div className="flex items-center gap-2">
					<label htmlFor={`${baseId}-input`} className="sr-only">
						Saisir l’heure
					</label>
					<input
						id={`${baseId}-input`}
						type="text"
						inputMode="numeric"
						autoComplete="off"
						placeholder="HH:MM"
						value={value}
						onChange={(event) =>
							onChange(normalizeTimeInput(event.target.value))
						}
						onBlur={() => {
							// « 9 » seul est une saisie en cours, pas une heure : on ne
							// réécrit pas derrière l'utilisateur.
							if (/^\d$/.test(value.trim())) onChange("");
						}}
						className="h-8 w-full rounded-md border bg-background px-2 font-mono text-sm tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
					/>
				</div>

				<div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
					<div
						role="listbox"
						aria-label="Heure"
						className="grid max-h-48 grid-cols-4 gap-1 overflow-y-auto"
					>
						{hours.map((candidate) => (
							<button
								key={candidate}
								type="button"
								role="option"
								aria-selected={hour === candidate}
								onClick={() =>
									// Une heure seule sans minute choisie conserve la minute
									// existante : cliquer 9 ne doit pas effacer 9:30.
									commit(candidate, minute ?? 0)
								}
								className={cn(
									"h-8 rounded-md text-sm tabular-nums transition-colors hover:bg-accent hover:text-accent-foreground",
									hour === candidate && "bg-primary text-primary-foreground",
								)}
							>
								{formatHour(candidate)}
							</button>
						))}
					</div>
					<div
						role="listbox"
						aria-label="Minute"
						className="grid max-h-48 grid-cols-1 content-start gap-1 overflow-y-auto"
					>
						{MINUTES.map((candidate) => (
							<button
								key={candidate}
								type="button"
								role="option"
								aria-selected={minute === candidate}
								// Choisir la minute avant l'heure sur un champ vide n'a pas
								// d'heure où s'appliquer : on l'ignore plutôt que d'inventer
								// 00:00 comme retrait.
								disabled={hour === null}
								onClick={() => commit(hour as number, candidate)}
								className={cn(
									"h-8 rounded-md px-2 text-sm tabular-nums transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40",
									minute === candidate && "bg-primary text-primary-foreground",
								)}
							>
								{String(candidate).padStart(2, "0")}
							</button>
						))}
					</div>
				</div>

				<Button
					type="button"
					variant="ghost"
					size="xs"
					className="mt-2 w-full"
					disabled={!value}
					onClick={() => {
						onChange("");
						setOpen(false);
					}}
				>
					Effacer
				</Button>
			</PopoverContent>
		</Popover>
	);
}
