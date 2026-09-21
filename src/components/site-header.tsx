import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Separator } from "#/components/ui/separator";
import { SidebarTrigger } from "#/components/ui/sidebar";

export function SiteHeader({
	title,
	links,
	actions,
}: {
	title: string;
	links?: Array<{ label: string; href: string }>;
	actions?: ReactNode;
}) {
	return (
		<header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<SidebarTrigger className="-ml-1" />
				<Separator
					orientation="vertical"
					className="mx-2 data-[orientation=vertical]:h-4"
				/>
				<h1 className="text-base font-medium">{title}</h1>
				{links && links.length > 0 && (
					<nav className="ml-4 flex items-center gap-1">
						{links.map((link) => (
							<Link
								key={link.href}
								to={link.href}
								activeOptions={{ exact: true }}
								activeProps={{ "aria-current": "page" as const }}
								className="text-sm text-muted-foreground hover:text-foreground px-2 py-1 rounded-md transition-colors aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
							>
								{link.label}
							</Link>
						))}
					</nav>
				)}
				{actions && (
					<div className="ml-auto flex items-center gap-2">{actions}</div>
				)}
			</div>
		</header>
	);
}
