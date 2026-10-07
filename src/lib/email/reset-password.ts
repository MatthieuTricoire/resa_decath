import { and, count, eq, gt, like, sql } from "drizzle-orm";
import { store } from "#/config/store";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { sendEmail } from "#/lib/email/transport";

/**
 * Code de réinitialisation de mot de passe (flux « mot de passe oublié »).
 *
 * Le plugin emailOTP de Better Auth génère déjà le code et l'expose via son
 * endpoint `/email-otp/request-password-reset` ; ce module ne fait que
 * l'acheminer à son destinataire par email, avec le même garde-fou de quota
 * que les liens magiques : on ne s'appuie pas sur une liste blanche, mais sur
 * des plafonds (par adresse et global) sur les 24 h glissantes, comptés par
 * des lignes-sentinelles dans `verification`.
 *
 * Seuls les comptes à mot de passe (provider `credential`) peuvent demander
 * un reset : les clients se connectent par lien magique et n'ont pas de mot
 * de passe à réinitialiser. Pour une adresse sans compte de ce type, on
 * refuse l'envoi — l'endpoint renvoie de toute façon une réponse neutre.
 */

const SENTINEL_PREFIX = "reset-otp-sent:";
const PER_EMAIL_MAX_SENDS = 5;
const GLOBAL_MAX_SENDS = 30;
const SENTINEL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Doit rester cohérent avec `expiresIn` par défaut du plugin emailOTP. */
const OTP_EXPIRY_MINUTES = 5;

export type ResetOtpDecision =
	| { ok: true }
	| { ok: false; reason: "no-user" | "email-cap" | "global-cap" };

const FONT = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
const INK = "#1f2937";
const INK_SOFT = "#4b5563";
const SAND = "#f3f4f6";
const FOAM = "#f9fafb";
const BORDER = "#e5e7eb";

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function buildHtml(otp: string): string {
	return `<!doctype html>
<html lang="fr">
	<body style="margin:0;padding:0;background:${SAND};">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SAND};">
			<tr>
				<td align="center" style="padding:24px 12px;">
					<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
						<tr>
							<td style="padding:28px 28px 8px;">
								<p style="margin:0 0 4px;font:600 18px/1.3 ${FONT};color:${INK};">${escapeHtml(store.name)}</p>
								<p style="margin:0 0 20px;font:400 13px/1.4 ${FONT};color:${INK_SOFT};">Accès équipe</p>
								<h1 style="margin:0 0 12px;font:600 22px/1.3 ${FONT};color:${INK};">Réinitialiser mon mot de passe</h1>
								<p style="margin:0 0 20px;font:400 15px/1.5 ${FONT};color:${INK};">
									Voici votre code de vérification. Saisissez-le sur le site pour
									choisir un nouveau mot de passe.
								</p>
							</td>
						</tr>
						<tr>
							<td align="center" style="padding:0 28px 20px;">
								<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:280px;background:${FOAM};border:1px solid ${BORDER};border-radius:12px;">
									<tr>
										<td align="center" style="padding:18px 16px;">
											<p style="margin:0;font:700 32px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:${INK};letter-spacing:.12em;">${escapeHtml(otp)}</p>
										</td>
									</tr>
								</table>
							</td>
						</tr>
						<tr>
							<td style="padding:0 28px 28px;">
								<p style="margin:0 0 12px;font:400 13px/1.5 ${FONT};color:${INK_SOFT};">
									Ce code est valable ${OTP_EXPIRY_MINUTES} minutes et ne fonctionne qu'une fois.
									Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer ce mail.
								</p>
								<p style="margin:0;padding-top:16px;border-top:1px solid ${BORDER};font:400 12px/1.5 ${FONT};color:${INK_SOFT};">
									${escapeHtml(store.name)} — ${escapeHtml(store.fullAddress)}<br />
									Ce mail est généré automatiquement, merci de ne pas y répondre.
								</p>
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>`;
}

function buildText(otp: string): string {
	return [
		`${store.name} — Réinitialiser mon mot de passe`,
		"",
		"Voici votre code de vérification :",
		otp,
		"",
		`Ce code est valable ${OTP_EXPIRY_MINUTES} minutes et ne fonctionne qu'une fois.`,
		"Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer ce mail.",
		"",
		`${store.name} — ${store.fullAddress}`,
	].join("\n");
}

/**
 * Autoriser ou non l'envoi d'un code de réinitialisation pour `email`.
 *
 * Contrôles dans l'ordre : l'adresse doit appartenir à une ligne `user`
 * liée à un compte `credential` (un mot de passe existe), puis les plafonds
 * par adresse et global sur les 24 h glissantes. Si tout passe, un jalon est
 * posé dans `verification` et la fonction dit `ok` — l'envoi n'a plus qu'à
 * suivre. Les lignes-sentinelles expirent en 24 h : aucune purge à écrire.
 */
export async function canSendResetOtp(
	email: string,
): Promise<ResetOtpDecision> {
	const normalized = email.trim().toLowerCase();
	const now = new Date();

	const [credential] = await db
		.select({ userId: schema.account.userId })
		.from(schema.account)
		.innerJoin(schema.user, eq(schema.user.id, schema.account.userId))
		.where(
			and(
				eq(schema.account.providerId, "credential"),
				eq(sql`lower(${schema.user.email})`, normalized),
			),
		)
		.limit(1);
	if (!credential) {
		return { ok: false, reason: "no-user" };
	}

	const identifier = `${SENTINEL_PREFIX}${normalized}`;
	const [emailCount] = await db
		.select({ value: count() })
		.from(schema.verification)
		.where(
			and(
				eq(schema.verification.identifier, identifier),
				gt(schema.verification.expiresAt, now),
			),
		);
	if (emailCount.value >= PER_EMAIL_MAX_SENDS) {
		return { ok: false, reason: "email-cap" };
	}

	const [globalCount] = await db
		.select({ value: count() })
		.from(schema.verification)
		.where(
			and(
				like(schema.verification.identifier, `${SENTINEL_PREFIX}%`),
				gt(schema.verification.expiresAt, now),
			),
		);
	if (globalCount.value >= GLOBAL_MAX_SENDS) {
		return { ok: false, reason: "global-cap" };
	}

	await db.insert(schema.verification).values({
		id: crypto.randomUUID(),
		identifier,
		value: normalized,
		expiresAt: new Date(now.getTime() + SENTINEL_WINDOW_MS),
		createdAt: now,
		updatedAt: now,
	});

	return { ok: true };
}

export async function sendResetOtpEmail({
	to,
	otp,
}: {
	to: string;
	otp: string;
}): Promise<void> {
	const result = await sendEmail({
		to,
		subject: "Votre code de réinitialisation de mot de passe",
		html: buildHtml(otp),
		text: buildText(otp),
	});
	// Sans transport configuré (dev), garder le code visible en console pour
	// pouvoir tester le flux localement — comme les OTP de connexion existants.
	if (result.status === "skipped") {
		console.log(`✉️ [RESET] Code de réinitialisation pour ${to} : ${otp}`);
	}
}
