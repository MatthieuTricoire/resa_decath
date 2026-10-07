import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin, emailOTP, magicLink } from "better-auth/plugins";
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

		/**
		 * Connexion client par lien cliquable, sans mot de passe.
		 *
		 * La ligne `user` existe déjà pour qui a réservé sur le site : à la
		 * vérification du lien, Better Auth retrouve cette ligne par email et lui
		 * accroche directement la session — sans exiger de ligne `account`, et sans
		 * créer de doublon (l'email est unique). L'historique est donc visible
		 * immédiatement, sans migration ni réconciliation de données.
		 *
		 * `storeToken: "hashed"` stocke une empreinte du jeton plutôt que le jeton
		 * lui-même : une fuite de la table `verification` ne donnerait alors aucun
		 * lien exploitable. Le défaut est `"plain"`.
		 *
		 * `disableSignUp` : un compte sans réservation n'a rien à montrer, et la
		 * réservation publique crée déjà la ligne `user`. Sans cette option,
		 * n'importe quelle adresse demandait créerait une ligne `user` sans avoir
		 * jamais prouvé qu'elle lui appartenait.
		 *
		 * Le module d'email est importé dynamiquement, comme pour l'email de
		 * réservation : le code du mail ne doit pas être chargé quand personne ne
		 * demande de lien.
		 */
		magicLink({
			storeToken: "hashed",
			expiresIn: 900,
			disableSignUp: true,
			async sendMagicLink({ email, url }) {
				const { canSendMagicLink, sendMagicLinkEmail } = await import(
					"#/lib/email/magic-link"
				);
				// Du côté serveur : la ligne `verification` du plugin est déjà écrite
				// et la réponse HTTP restera 200 quoi qu'il arrive, donc refuser
				// l'envoi ici ne révèle rien au demandeur — c'est le point de coupure
				// du gros du gaspillage (adresses inventées, re-sollicitation).
				const decision = await canSendMagicLink(email);
				if (!decision.ok) {
					console.log(
						`✉️ [LIEN MAGIQUE] Envoi ignoré pour ${email} (${decision.reason}) — quota préservé.`,
					);
					return;
				}
				await sendMagicLinkEmail({ to: email.trim(), url });
			},
		}),

		emailOTP({
			async sendVerificationOTP({ email, otp, type }) {
				if (type === "forget-password") {
					// Mot de passe oublié : le code part par email (Resend) via le
					// module dédié, avec le même garde-fou de quota que les liens
					// magiques (plafonds par adresse et global sur 24 h). Seuls les
					// comptes à mot de passe (admin/gérant) sont concernés.
					// Import dynamique comme pour les liens magiques : le code du
					// mail ne doit pas être chargé quand personne ne demande de code.
					const { canSendResetOtp, sendResetOtpEmail } = await import(
						"#/lib/email/reset-password"
					);
					const decision = await canSendResetOtp(email);
					if (!decision.ok) {
						// La ligne `verification` du plugin est déjà écrite et la
						// réponse restera 200 : refuser ici ne révèle rien au demandeur.
						console.log(
							`✉️ [RESET OTP] Envoi ignoré pour ${email} (${decision.reason}) — quota préservé.`,
						);
						return;
					}
					await sendResetOtpEmail({ to: email.trim(), otp });
					return;
				}
				if (type === "sign-in") {
					// C'est ce bloc précis qui servira pour le flux de réservation fluide du client
					console.log(`✉️ [CONNEXION] Code secret pour ${email} : ${otp}`);
				} else if (type === "email-verification") {
					console.log(
						`✉️ [VÉRIFICATION] Code de validation pour ${email} : ${otp}`,
					);
				}
			},
		}),

		tanstackStartCookies(), // doit toujours être le dernier plugin pour assurer la gestion correcte des cookies de session
	],
	secret: env.BETTER_AUTH_SECRET,
});
