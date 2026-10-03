import { LockIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { rentalDurationLabel } from "#/lib/dates";
import { cn } from "#/lib/utils";

/**
 * Boutons de durée. Présentatif : une durée est grisée quand l'appelant en
 * fournit la raison, jamais parce que ce composant l'a décidé. La raison reste
 * dans le flux (`sr-only`), pas dans un `title`.
 */
export function DurationPicker({
	durations,
	currentDuration,
	blockedReasons,
	onPick,
}: {
	durations: number[];
	/** Durée courante en jours, `0` si la fenêtre n'est pas complète. */
	currentDuration: number;
	blockedReasons: ReadonlyMap<number, string>;
	onPick: (duration: number) => void;
}) {
	return (
		<div className="flex flex-wrap gap-2">
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
						className={cn(
							"inline-flex h-10 items-center gap-1.5 sm:h-8",
							reason && "opacity-60",
						)}
						onClick={() => onPick(duration)}
					>
						<span>{rentalDurationLabel(duration)}</span>
						{reason && (
							<LockIcon
								className="size-3.5 shrink-0 opacity-70"
								aria-hidden="true"
							/>
						)}
						{reason && <span className="sr-only"> — {reason}</span>}
					</Button>
				);
			})}
		</div>
	);
}
