import z from "zod";

export const loginSchema = z.object({
	email: z.email("Email invalide"),
	password: z.string().min(8, "Mot de passe probablement trop court"),
});

export type LoginFormData = z.infer<typeof loginSchema>;
