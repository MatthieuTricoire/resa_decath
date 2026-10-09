import { Minus, Plus } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";

/**
 * Sélecteur de quantité par boutons − / +. Présentatif : le plafond (stock
 * restant) est fourni par l'appelant, qui décide aussi de ce que « 0 » signifie.
 */
export function QuantityStepper({
	value,
	min = 1,
	max,
	onChange,
	label = "Quantité",
	itemName,
	hideLabel = false,
	size = "default",
	disabled = false,
	className,
}: {
	value: number;
	min?: number;
	max: number;
	onChange: (next: number) => void;
	/** Nom accessible du champ, affiché sauf si `hideLabel`. */
	label?: string;
	/** Matériel concerné, pour des noms de boutons précis dans une liste. */
	itemName?: string;
	hideLabel?: boolean;
	size?: "default" | "compact";
	disabled?: boolean;
	className?: string;
}) {
	const compact = size === "compact";
	const suffix = itemName ? ` de ${itemName}` : "";

	if (compact) {
		return (
			<div
				className={cn(
					"inline-flex h-10 shrink-0 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] p-1 shadow-xs",
					className,
				)}
			>
				<button
					type="button"
					className="grid size-8 place-items-center rounded-md text-foreground transition-colors hover:bg-black/5 active:scale-95 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-white/10"
					aria-label={`Diminuer la quantité${suffix}`}
					disabled={disabled || value <= min}
					onClick={() => onChange(Math.max(min, value - 1))}
				>
					<Minus className="size-3.5" aria-hidden="true" />
				</button>
				<output
					className="w-7 select-none text-center text-sm font-bold tabular-nums text-foreground"
					aria-label={`${label}${suffix} : ${value}`}
				>
					{value}
				</output>
				<button
					type="button"
					className="grid size-8 place-items-center rounded-md text-foreground transition-colors hover:bg-black/5 active:scale-95 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-white/10"
					aria-label={`Augmenter la quantité${suffix}`}
					disabled={disabled || value >= max}
					onClick={() => onChange(Math.min(max, value + 1))}
				>
					<Plus className="size-3.5" aria-hidden="true" />
				</button>
			</div>
		);
	}

	return (
		<div className={cn("flex items-center gap-2 text-sm", className)}>
			{hideLabel ? null : <span className="shrink-0">{label}</span>}
			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="outline"
					size={compact ? "icon-sm" : "icon"}
					aria-label={`Diminuer la quantité${suffix}`}
					disabled={disabled || value <= min}
					onClick={() => onChange(Math.max(min, value - 1))}
				>
					<Minus aria-hidden="true" />
				</Button>
				<Input
					readOnly
					tabIndex={-1}
					inputMode="numeric"
					aria-label={`${label}${suffix}`}
					value={value}
					className={cn(
						"w-10 cursor-default px-1 text-center font-semibold tabular-nums",
						compact ? "h-8" : "h-9",
					)}
				/>
				<Button
					type="button"
					variant="outline"
					size={compact ? "icon-sm" : "icon"}
					aria-label={`Augmenter la quantité${suffix}`}
					disabled={disabled || value >= max}
					onClick={() => onChange(Math.min(max, value + 1))}
				>
					<Plus aria-hidden="true" />
				</Button>
			</div>
		</div>
	);
}
