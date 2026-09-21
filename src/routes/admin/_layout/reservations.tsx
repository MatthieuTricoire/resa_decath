import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { SiteHeader } from "#/components/site-header";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/admin/_layout/reservations")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<>
			<SiteHeader
				title="Réservations"
				links={[{ label: "Liste", href: "/admin/reservations" }]}
				actions={
					<Button variant="outline" size="sm" asChild>
						<Link to="/admin/reservations/ajouter">
							<Plus />
							Créer une réservation
						</Link>
					</Button>
				}
			/>
			<div className="@container/main flex flex-1 flex-col gap-2">
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
					<Outlet />
				</div>
			</div>
		</>
	);
}
