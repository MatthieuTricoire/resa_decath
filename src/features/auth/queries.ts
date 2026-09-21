import { redirect } from "@tanstack/react-router";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getSession } from "./session.server";

export type AppRole = "user" | "manager" | "admin";

const DASHBOARD_ROLES: AppRole[] = ["admin", "manager"];

// Accès au dashboard admin : admins et gérants
export const getDashboardSession = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getSession();

		if (!session) {
			throw redirect({ to: "/admin/login" });
		}

		if (!DASHBOARD_ROLES.includes(session.user.role as AppRole)) {
			throw redirect({ to: "/" });
		}

		return session;
	},
);

// Accès strict admin (modifications sensibles, ex: tarification)
export const requireAdminSession = createServerOnlyFn(async () => {
	const session = await getSession();

	if (!session || session.user.role !== "admin") {
		throw new Error("Accès refusé : réservé aux administrateurs.");
	}

	return session;
});
