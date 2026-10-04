import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SiteHeader } from "#/components/site-header";
export const Route = createFileRoute("/admin/_layout/reglages")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<>
			<SiteHeader
				title="Réglages"
				links={[
					{ label: "Horaires", href: "/admin/reglages/horaires" },
					{ label: "Location", href: "/admin/reglages" },
					{ label: "Catégories", href: "/admin/reglages/categories" },
					{ label: "Produits", href: "/admin/reglages/produits" },
					{ label: "Facturation", href: "/admin/reglages/facturation" },
				]}
			/>
			<div className="@container/main flex flex-1 flex-col gap-2">
				<Outlet />
			</div>
		</>
	);
}
