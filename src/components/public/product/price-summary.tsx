import { formatPrice } from "#/stores/public-cart.store";

export type PriceSummaryData =
	| { kind: "quote"; durationLabel: string; price: number }
	| {
			kind: "list";
			options: Array<{ id: string; label: string; price: number }>;
	  };

/**
 * Prix de la variante choisie : le total du devis quand la fenêtre est
 * complète, sinon la liste des tarifs de la variante.
 */
export function PriceSummary({ data }: { data: PriceSummaryData }) {
	return (
		<div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
			{data.kind === "quote" ? (
				<div className="flex items-baseline justify-between">
					<span className="text-sm text-[var(--sea-ink-soft)]">
						Total pour {data.durationLabel}
					</span>
					<span className="text-2xl font-bold tracking-tight text-[var(--sea-ink)]">
						{formatPrice(data.price)}
					</span>
				</div>
			) : (
				<div>
					<h2 className="island-kicker mb-2">Nos tarifs</h2>
					<ul className="space-y-1.5 text-sm">
						{data.options.map((option) => (
							<li
								key={option.id}
								className="flex justify-between border-b border-[var(--line)]/50 py-1 last:border-0"
							>
								<span className="text-[var(--sea-ink-soft)]">
									{option.label}
								</span>
								<span className="font-semibold">
									{formatPrice(option.price)}
								</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
