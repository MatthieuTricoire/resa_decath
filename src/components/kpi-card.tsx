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

type KpiCardProps = {
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
	label,
	value,
	trend,
	footer,
	children,
}: KpiCardProps) {
	return (
		<Card className="@container/card">
			<CardHeader>
				<CardDescription>{label}</CardDescription>
				<CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
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
