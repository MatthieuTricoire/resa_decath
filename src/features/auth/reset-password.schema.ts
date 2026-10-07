import z from "zod";

export const requestResetSchema = z.object({
	email: z.email("Email invalide"),
});

export const resetPasswordSchema = z
	.object({
		email: z.email("Email invalide"),
		otp: z
			.string()
			.regex(/^\d{6}$/, "Le code de vérification comporte 6 chiffres"),
		newPassword: z
			.string()
			.min(8, "Le nouveau mot de passe doit contenir au moins 8 caractères"),
		confirmPassword: z.string().min(1, "Confirmez le nouveau mot de passe"),
	})
	.refine((value) => value.newPassword === value.confirmPassword, {
		message: "Les mots de passe ne correspondent pas",
		path: ["confirmPassword"],
	});
