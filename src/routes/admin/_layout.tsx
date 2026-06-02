import { createFileRoute, Outlet } from "@tanstack/react-router";
import { getAdminSession } from "#/features/auth/queries";

export const Route = createFileRoute("/admin/_layout")({
	beforeLoad: async () => {
		const session = await getAdminSession();
		return { session };
	},
	component: AdminLayout,
});

function AdminLayout() {
	return (
		<div>
			<Outlet />
		</div>
	);
}
