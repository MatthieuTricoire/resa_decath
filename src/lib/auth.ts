import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin, emailOTP } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { env } from "#/env";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",

		schema: {
			user: schema.user,
			session: schema.session,
			account: schema.account,
			verification: schema.verification,
		},
	}),

	// Activé pour admin et équipe (Accès dashboard)
	emailAndPassword: {
		enabled: true,
	},

	user: {
		additionalFields: {
			role: {
				type: "string",
				defaultValue: "user",
			},
		},
	},
	plugins: [
		admin(),
		emailOTP({
			async sendVerificationOTP({ email, otp, type }) {
				if (type === "sign-in") {
					// C'est ce bloc précis qui servira pour le flux de réservation fluide du client
					console.log(`✉️ [CONNEXION] Code secret pour ${email} : ${otp}`);
				} else if (type === "email-verification") {
					console.log(
						`✉️ [VÉRIFICATION] Code de validation pour ${email} : ${otp}`,
					);
				} else {
					console.log(
						`✉️ [PASSWORD_RESET] Code de récupération pour ${email} : ${otp}`,
					);
				}
			},
		}),

		tanstackStartCookies(), // doit toujours être le dernier plugin pour assurer la gestion correcte des cookies de session
	],
	secret: env.BETTER_AUTH_SECRET,
});
