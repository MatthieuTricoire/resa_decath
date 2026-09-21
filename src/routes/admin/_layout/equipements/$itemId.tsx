import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/_layout/equipements/$itemId")({
	component: RouteComponent,
});

function RouteComponent() {
	return <Outlet />;
}
