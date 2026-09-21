import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/_layout/utilisateurs/$userId")({
	component: RouteComponent,
});

function RouteComponent() {
	return <Outlet />;
}
