import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "#/lib/auth";

export const getAdminSession = createServerFn({ method: "GET" }).handler(
	async () => {
		const request = getRequest();

		const session = await auth.api.getSession({
			headers: request.headers,
		});

		if (!session) {
			throw redirect({ to: "/admin/login" });
		}

		if (session.user.role !== "admin") {
			throw redirect({ to: "/" });
		}

		return session;
	},
);
