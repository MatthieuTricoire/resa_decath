import { Badge } from "#/components/ui/badge";

/** Récapitulatif d'une ligne de panier : variante, durée, prix unitaire. */
export function LineMetaBadges({
	variantLabel,
	durationLabel,
	priceLabel,
}: {
	variantLabel: string;
	durationLabel: string;
	priceLabel: string;
}) {
	return (
		<ul className="flex flex-wrap gap-1.5">
			{(
				[
					["variant", variantLabel],
					["duration", durationLabel],
					["price", priceLabel],
				] as const
			)
				.filter(([, label]) => label !== "")
				.map(([key, label]) => (
					<li key={key}>
						<Badge variant="secondary" className="font-normal">
							{label}
						</Badge>
					</li>
				))}
		</ul>
	);
}
