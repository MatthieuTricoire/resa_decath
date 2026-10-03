import type { VariantOption } from "#/components/public/product/derive-selection";
import { cn } from "#/lib/utils";

/**
 * Choix de la variante. Présentatif : chaque option arrive avec sa précision
 * déjà rédigée (« indisponible sur 3 jours », « épuisé pour ces dates »).
 */
export function VariantPicker({
	options,
	selectedId,
	onSelect,
}: {
	options: VariantOption[];
	selectedId: string | null;
	onSelect: (variantId: string) => void;
}) {
	return (
		<fieldset className="space-y-2">
			<legend className="island-kicker mb-2">Choix de la variante</legend>
			{options.map((option) => (
				<label
					key={option.id}
					className={cn(
						"flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm",
						option.disabled ? "opacity-60" : "cursor-pointer",
					)}
				>
					<input
						type="radio"
						name="variant"
						value={option.id}
						checked={selectedId === option.id}
						disabled={option.disabled}
						onChange={() => onSelect(option.id)}
					/>
					<span>{option.label}</span>
					{option.note ? (
						<span className="ml-auto text-xs text-[var(--sea-ink-soft)]">
							{option.note}
						</span>
					) : null}
				</label>
			))}
		</fieldset>
	);
}
