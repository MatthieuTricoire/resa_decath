import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SiteHeader } from "#/components/site-header";

export const Route = createFileRoute("/admin/_layout/utilisateurs")({
	component: UsersLayout,
});

function UsersLayout() {
	return (
		<>
			<SiteHeader
				title="Utilisateurs"
				links={[
					{ label: "Liste", href: "/admin/utilisateurs" },
					{ label: "Ajouter", href: "/admin/utilisateurs/ajouter" },
				]}
			/>
			<div className="@container/main flex flex-1 flex-col gap-2">
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
					<Outlet />
				</div>
			</div>
		</>
	);
}
