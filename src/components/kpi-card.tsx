import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardAction,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { cn } from "#/lib/utils.ts";

type KpiCardProps = {
	compact?: boolean;
	label: string;
	value: string | number;
	trend?: {
		direction: "up" | "down";
		value: string;
	};
	footer?: {
		primary: string;
		secondary?: string;
	};
	children?: ReactNode;
};

export function KpiCard({
	compact = false,
	label,
	value,
	trend,
	footer,
	children,
}: KpiCardProps) {
	return (
		<Card
			className={cn(
				"@container/card min-w-0",
				compact && "gap-2 py-3 sm:gap-6 sm:py-6",
			)}
		>
			<CardHeader className={cn(compact && "gap-1.5 px-2 sm:px-3 lg:px-6")}>
				<CardDescription
					className={cn(
						compact && "text-xs leading-tight sm:text-sm sm:leading-normal",
					)}
				>
					{label}
				</CardDescription>
				<CardTitle
					className={cn(
						"font-semibold tabular-nums",
						compact ? "text-xl sm:text-2xl" : "text-2xl",
						"@[250px]/card:text-3xl",
					)}
				>
					{value}
				</CardTitle>
				{trend && (
					<CardAction>
						<Badge variant="outline">
							{trend.direction === "up" ? (
								<IconTrendingUp />
							) : (
								<IconTrendingDown />
							)}
							{trend.value}
						</Badge>
					</CardAction>
				)}
			</CardHeader>
			{children}
			{footer && (
				<CardFooter className="flex-col items-start gap-1.5 text-sm">
					<div className="line-clamp-1 flex gap-2 font-medium">
						{footer.primary}
						{trend &&
							(trend.direction === "up" ? (
								<IconTrendingUp className="size-4" />
							) : (
								<IconTrendingDown className="size-4" />
							))}
					</div>
					{footer.secondary && (
						<div className="text-muted-foreground">{footer.secondary}</div>
					)}
				</CardFooter>
			)}
		</Card>
	);
}
