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
		<header className="flex min-h-(--header-height) shrink-0 items-center gap-2 border-b py-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) md:py-0">
			<div className="flex w-full min-w-0 flex-1 flex-wrap items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<SidebarTrigger className="-ml-1" />
				<Separator
					orientation="vertical"
					className="mx-2 data-[orientation=vertical]:h-4"
				/>
				<h1 className="min-w-0 truncate text-base font-medium">{title}</h1>
				{links && links.length > 0 && (
					<nav className="ml-4 hidden items-center gap-1 md:flex">
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
					<div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
						{actions}
					</div>
				)}
			</div>
		</header>
	);
}
