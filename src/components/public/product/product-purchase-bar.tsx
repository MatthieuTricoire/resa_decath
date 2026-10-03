import { CalendarClock, CalendarDays, Plus } from "lucide-react";
import type { PurchaseCtaIcon } from "#/components/public/product/derive-purchase";
import { QuantityStepper } from "#/components/public/shared/quantity-stepper";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

const ICONS = {
	dates: CalendarDays,
	duration: CalendarClock,
	add: Plus,
} satisfies Record<PurchaseCtaIcon, unknown>;

/**
 * Quantité + bouton d'achat. Rendu deux fois par la fiche (ligne desktop et
 * barre mobile) avec les mêmes props ; `compact` ne change que la mise en page.
 * Le conteneur `fixed` de la barre mobile reste dans la page.
 */
export function ProductPurchaseBar({
	quantity,
	quantityMax,
	onQuantityChange,
	label,
	icon,
	disabled,
	busy,
	onClick,
	compact = false,
}: {
	quantity: number;
	quantityMax: number;
	onQuantityChange: (next: number) => void;
	label: string;
	icon: PurchaseCtaIcon;
	disabled: boolean;
	busy: boolean;
	onClick: () => void;
	compact?: boolean;
}) {
	const Icon = ICONS[icon];
	return (
		<div className={cn("flex items-center gap-3", !compact && "flex-wrap")}>
			<QuantityStepper
				value={quantity}
				max={quantityMax}
				onChange={onQuantityChange}
				hideLabel={compact}
				className="shrink-0"
			/>
			<Button
				size="lg"
				className={cn(compact && "flex-1")}
				onClick={onClick}
				disabled={disabled}
				aria-busy={busy}
			>
				<Icon className="size-4" aria-hidden="true" />
				{label}
			</Button>
		</div>
	);
}
