import {
	IconCalendarWeek,
	IconChartBar,
	IconDashboard,
	IconReceiptEuro,
	IconSettings,
	IconStack3,
	IconUserShield,
	IconUsers,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Mountain } from "lucide-react";
import { NavMain } from "#/components/nav-main.tsx";
import { NavSecondary } from "#/components/nav-secondary.tsx";
import { NavUser } from "#/components/nav-user.tsx";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuItem,
} from "#/components/ui/sidebar.tsx";
import { store } from "#/config/store";

const data = {
	navMain: [
		{
			title: "Dashboard",
			url: "/admin",
			icon: IconDashboard,
			exact: true,
		},
		{
			title: "Réservations",
			url: "/admin/reservations",
			icon: IconCalendarWeek,
		},
		{
			title: "Utilisateurs",
			url: "/admin/utilisateurs",
			icon: IconUsers,
		},
		{
			title: "Matériel",
			url: "/admin/equipements",
			icon: IconStack3,
		},
		{
			title: "Statistiques",
			url: "/admin/statistiques",
			icon: IconChartBar,
		},
	],
	navSecondary: [
		{
			title: "Facturation",
			url: "/admin/facturation",
			icon: IconReceiptEuro,
		},
		{
			title: "Réglages",
			url: "/admin/reglages",
			icon: IconSettings,
		},
		{
			title: "Équipe",
			url: "/admin/equipe",
			icon: IconUserShield,
		},
	],
};

export function AppSidebar({
	user,
	...props
}: {
	user: { name: string; email: string; avatar: string; role?: string };
} & React.ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar collapsible="offcanvas" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<Link
							to="/admin"
							className="flex items-center gap-2 px-3 no-underline"
						>
							<Mountain
								className="size-5 text-primary dark:text-[#9aa7f5]"
								aria-hidden="true"
							/>
							<span className="display-title text-base font-semibold text-primary dark:text-[#9aa7f5]">
								{store.name}
							</span>
						</Link>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={data.navMain} />
				<NavSecondary items={data.navSecondary} className="mt-auto" />
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={user} />
			</SidebarFooter>
		</Sidebar>
	);
}
