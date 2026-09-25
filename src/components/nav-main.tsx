import { type Icon, IconCirclePlusFilled } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "#/components/ui/sidebar.tsx";

export function NavMain({
	items,
}: {
	items: {
		title: string;
		url: string;
		icon?: Icon;
		exact?: boolean;
	}[];
}) {
	const { setOpenMobile } = useSidebar();

	return (
		<SidebarGroup>
			<SidebarGroupContent className="flex flex-col gap-2">
				<SidebarMenu>
					<SidebarMenuItem className="flex items-center gap-2">
						<SidebarMenuButton
							asChild
							tooltip="Créer une réservation"
							className="min-w-8 bg-primary text-white duration-200 ease-linear hover:bg-primary/90 hover:text-white active:bg-primary/90 active:text-white"
						>
							<Link
								to="/admin/reservations/ajouter"
								onClick={() => setOpenMobile(false)}
								className="text-white"
								style={{ color: "white" }}
							>
								<IconCirclePlusFilled />
								<span>Créer une réservation</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
				<SidebarMenu>
					{items.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton asChild tooltip={item.title}>
								<Link
									to={item.url}
									activeOptions={{ exact: item.exact ?? false }}
									activeProps={{ "data-active": true as const }}
									onClick={() => setOpenMobile(false)}
								>
									{item.icon && <item.icon />}
									<span>{item.title}</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
