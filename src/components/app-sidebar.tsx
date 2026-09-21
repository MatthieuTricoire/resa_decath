import {
	IconCalendarWeek,
	IconCamera,
	IconChartBar,
	IconClock,
	IconDashboard,
	IconFileAi,
	IconFileDescription,
	IconReceiptEuro,
	IconSearch,
	IconSettings,
	IconStack3,
	IconUsers,
} from "@tabler/icons-react";
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
			title: "Durées",
			url: "/admin/durees",
			icon: IconClock,
		},
		{
			title: "Statistiques",
			url: "/admin/statistiques",
			icon: IconChartBar,
		},
		{
			title: "Facturation",
			url: "/admin/facturation",
			icon: IconReceiptEuro,
		},
	],
	navClouds: [
		{
			title: "Capture",
			icon: IconCamera,
			isActive: true,
			url: "#",
			items: [
				{
					title: "Active Proposals",
					url: "#",
				},
				{
					title: "Archived",
					url: "#",
				},
			],
		},
		{
			title: "Proposal",
			icon: IconFileDescription,
			url: "#",
			items: [
				{
					title: "Active Proposals",
					url: "#",
				},
				{
					title: "Archived",
					url: "#",
				},
			],
		},
		{
			title: "Prompts",
			icon: IconFileAi,
			url: "#",
			items: [
				{
					title: "Active Proposals",
					url: "#",
				},
				{
					title: "Archived",
					url: "#",
				},
			],
		},
	],
	navSecondary: [
		{
			title: "Settings",
			url: "#",
			icon: IconSettings,
		},
		{
			title: "Search",
			url: "#",
			icon: IconSearch,
		},
	],
};

export function AppSidebar({
	user,
	...props
}: {
	user: { name: string; email: string; avatar: string };
} & React.ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar collapsible="offcanvas" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<span className="text-base font-semibold px-3">Résa Decath</span>
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
