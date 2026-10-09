import { createServerFn } from "@tanstack/react-start";
import { asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import * as schema from "#/db/schema";
import {
	requireAdminSession,
	requireDashboardSession,
} from "#/features/auth/queries";
import { auth } from "#/lib/auth";
import { inviteTeamMemberSchema } from "./create-team-account.schema";

export type TeamMemberItem = {
	id: string;
	name: string;
	email: string;
	role: "admin" | "manager";
	hasPassword: boolean;
	createdAt: Date;
};

/**
 * Récupère la liste des membres d'équipe avec l'indicateur d'activation du compte
 * (un compte `credential` existe en base dès que le mot de passe est défini).
 */
export const getTeamMembers = createServerFn({ method: "GET" }).handler(
	async (): Promise<TeamMemberItem[]> => {
		await requireDashboardSession();

		const members = await db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				email: schema.user.email,
				role: schema.user.role,
				hasPassword: sql<boolean>`EXISTS (
					SELECT 1 FROM ${schema.account}
					WHERE ${schema.account.userId} = ${schema.user.id}
					AND ${schema.account.providerId} = 'credential'
				)`,
				createdAt: schema.user.createdAt,
			})
			.from(schema.user)
			.where(or(eq(schema.user.role, "admin"), eq(schema.user.role, "manager")))
			.orderBy(asc(schema.user.name));

		return members.map((m) => ({
			...m,
			role: m.role as "admin" | "manager",
		}));
	},
);

/**
 * Invite un nouveau collaborateur dans l'équipe sans mot de passe :
 * 1. Crée la ligne `user` avec son rôle (ou promeut un client existant).
 * 2. Déclenche l'envoi du mail d'invitation avec le lien sécurisé pour définir son mot de passe.
 */
export const inviteTeamMember = createServerFn({ method: "POST" })
	.validator(inviteTeamMemberSchema)
	.handler(async ({ data }) => {
		await requireAdminSession();

		const normalizedEmail = data.email.trim().toLowerCase();
		const name = data.name.trim();

		const [existingUser] = await db
			.select()
			.from(schema.user)
			.where(eq(sql`lower(${schema.user.email})`, normalizedEmail))
			.limit(1);

		if (existingUser) {
			if (existingUser.role === "admin" || existingUser.role === "manager") {
				throw new Error("Cet utilisateur fait déjà partie de l'équipe.");
			}

			// L'utilisateur existe en tant que client (ex: réservation passée) :
			// on met à jour son rôle en admin ou gérant
			await db
				.update(schema.user)
				.set({
					role: data.role,
					name: name || existingUser.name,
					updatedAt: new Date(),
				})
				.where(eq(schema.user.id, existingUser.id));
		} else {
			// Création d'un nouvel utilisateur dans la table `user`
			await db.insert(schema.user).values({
				id: crypto.randomUUID(),
				name,
				email: normalizedEmail,
				emailVerified: false,
				role: data.role,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}

		// Envoi de l'invitation avec le lien pour définir le mot de passe
		await auth.api.requestPasswordReset({
			body: {
				email: normalizedEmail,
				redirectTo: "/admin/definir-mot-de-passe",
			},
		});

		return { success: true, email: normalizedEmail };
	});

/**
 * Renvoie un lien d'invitation / définition de mot de passe à un membre de l'équipe.
 */
export const resendTeamInvitation = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string().min(1) }))
	.handler(async ({ data }) => {
		await requireAdminSession();

		const [member] = await db
			.select()
			.from(schema.user)
			.where(eq(schema.user.id, data.userId))
			.limit(1);

		if (!member || (member.role !== "admin" && member.role !== "manager")) {
			throw new Error("Membre de l'équipe introuvable.");
		}

		await auth.api.requestPasswordReset({
			body: {
				email: member.email,
				redirectTo: "/admin/definir-mot-de-passe",
			},
		});

		return { success: true, email: member.email };
	});
