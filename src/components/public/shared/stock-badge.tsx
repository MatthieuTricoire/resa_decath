import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";

export type StockTone = "available" | "soldOut" | "unknown";

const TONE_CLASSES: Record<StockTone, string> = {
	available:
		"bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
	soldOut:
		"bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
	unknown: "bg-secondary text-secondary-foreground",
};

/**
 * Pastille de disponibilité. Le ton et le texte sont décidés par l'appelant
 * d'après le devis serveur : la pastille ne juge jamais d'un stock.
 */
export function StockBadge({
	tone,
	children,
	className,
}: {
	tone: StockTone;
	children: ReactNode;
	className?: string;
}) {
	return (
		<Badge
			variant="secondary"
			className={cn(
				"h-auto whitespace-normal py-1 text-left",
				TONE_CLASSES[tone],
				className,
			)}
			data-tone={tone}
		>
			{children}
		</Badge>
	);
}
