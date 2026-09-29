import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("production"),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.string().min(1),
		// Email transactionnel. Tout est optionnel : sans clé, l'envoi se
		// contente de journaliser (utile en dev et sur les installs existantes).
		RESEND_API_KEY: z.string().min(1).optional(),
		RESEND_FROM: z.string().min(1).optional(),
		/** Destinataire forcé, ignoré en production : permet de router les
		 *  réservations de test vers une adresse dédiée. */
		RESEND_TEST_TO: z.string().min(1).optional(),
	},
	clientPrefix: "VITE_",
	client: {
		// VITE_APP_TITLE: z.string().min(1).optional(),
	},
	runtimeEnvStrict: {
		DATABASE_URL: process.env.DATABASE_URL,
		NODE_ENV: process.env.NODE_ENV,
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
		RESEND_API_KEY: process.env.RESEND_API_KEY,
		RESEND_FROM: process.env.RESEND_FROM,
		RESEND_TEST_TO: process.env.RESEND_TEST_TO,
	},
	onValidationError: (issues) => {
		console.error("❌ Erreur de validation des variables d'environnement :");
		console.error(JSON.stringify(issues, null, 2));
		throw new Error("Invalid environment variables");
	},
	emptyStringAsUndefined: true,
});
