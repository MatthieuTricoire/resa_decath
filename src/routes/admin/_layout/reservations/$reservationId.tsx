import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/admin/_layout/reservations/$reservationId",
)({
	component: RouteComponent,
});

function RouteComponent() {
	return <Outlet />;
}
