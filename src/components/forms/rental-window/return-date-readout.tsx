import { formatLongDate } from "#/lib/dates";

/** Date de retour déduite de la durée : en lecture seule, jamais saisie. */
export function ReturnDateReadout({ returnDate }: { returnDate: string }) {
	return (
		<div className="space-y-1.5 text-sm">
			<p className="font-semibold">Date de retour prévue</p>
			<div className="flex h-10 cursor-default select-none items-center rounded-xl border border-[var(--line)] bg-[var(--sand)]/30 px-3 font-medium text-[var(--sea-ink)] shadow-xs">
				{formatLongDate(returnDate)}
			</div>
		</div>
	);
}
