import z from "zod";

export const inviteTeamMemberSchema = z.object({
	name: z.string().min(1, "Le nom est requis"),
	email: z.email("Email invalide"),
	role: z.enum(["admin", "manager"]),
});

export type InviteTeamMemberFormData = z.infer<typeof inviteTeamMemberSchema>;

// Alias pour rétro-compatibilité
export const createTeamAccountSchema = inviteTeamMemberSchema;
export type CreateTeamAccountFormData = InviteTeamMemberFormData;

export const setPasswordSchema = z
	.object({
		password: z
			.string()
			.min(8, "Le mot de passe doit contenir au moins 8 caractères"),
		confirmPassword: z.string().min(1, "Confirmez le mot de passe"),
	})
	.refine((value) => value.password === value.confirmPassword, {
		message: "Les mots de passe ne correspondent pas",
		path: ["confirmPassword"],
	});

export type SetPasswordFormData = z.infer<typeof setPasswordSchema>;
