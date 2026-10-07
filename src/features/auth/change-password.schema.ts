import z from "zod";

export const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, "Saisissez votre mot de passe actuel"),
		newPassword: z
			.string()
			.min(8, "Le nouveau mot de passe doit contenir au moins 8 caractères"),
		confirmPassword: z.string().min(1, "Confirmez le nouveau mot de passe"),
	})
	.refine((value) => value.newPassword === value.confirmPassword, {
		message: "Les mots de passe ne correspondent pas",
		path: ["confirmPassword"],
	});

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
