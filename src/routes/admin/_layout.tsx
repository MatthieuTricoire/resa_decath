import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "#/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { getDashboardSession } from "#/features/auth/queries";

export const Route = createFileRoute("/admin/_layout")({
	loader: async () => {
		const session = await getDashboardSession();
		return { user: session.user };
	},
	component: AdminLayout,
});

function AdminLayout() {
	const { user } = Route.useLoaderData();

	return (
		<SidebarProvider
			style={
				{
					"--sidebar-width": "calc(var(--spacing) * 72)",
					"--header-height": "calc(var(--spacing) * 12)",
				} as React.CSSProperties
			}
		>
			<AppSidebar
				variant="inset"
				user={{
					name: user.name,
					email: user.email,
					avatar: user.image ?? "",
				}}
			/>
			<SidebarInset>
				<div className="flex flex-1 flex-col">
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
