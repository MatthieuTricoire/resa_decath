import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/_layout/durees")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/reglages", hash: "durees" });
	},
});
