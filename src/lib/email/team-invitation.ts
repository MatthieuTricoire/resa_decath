import { and, count, eq, gt, like, sql } from "drizzle-orm";
import { store } from "#/config/store";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { sendEmail } from "#/lib/email/transport";

/**
 * Email d'invitation d'un nouveau membre de l'équipe (admin ou gérant).
 *
 * Contient un lien d'activation unique et sécurisé permettant au collaborateur
 * de définir son mot de passe pour accéder au tableau de bord.
 *
 * Comme pour les liens magiques et les OTP de mot de passe, un garde-fou de
 * quota plafonne les envois par adresse et au niveau global sur 24 h glissantes,
 * via des lignes-sentinelles dans `verification`.
 */

const SENTINEL_PREFIX = "team-invitation-sent:";
const PER_EMAIL_MAX_SENDS = 5;
const GLOBAL_MAX_SENDS = 30;
const SENTINEL_WINDOW_MS = 24 * 60 * 60 * 1000;

export const INVITATION_EXPIRY_HOURS = 48;

export type TeamInvitationDecision =
	| {
			ok: true;
			user: {
				id: string;
				name: string;
				role: "admin" | "manager";
			};
	  }
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

function formatRoleLabel(role?: string): string {
	if (role === "admin") return "Administrateur";
	if (role === "manager") return "Gérant";
	return "Membre de l'équipe";
}

export function buildTeamInvitationHtml({
	name,
	role,
	url,
}: {
	name?: string;
	role?: string;
	url: string;
}): string {
	const greeting = name ? `Bonjour ${escapeHtml(name)},` : "Bonjour,";
	const roleLabel = formatRoleLabel(role);

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
								<p style="margin:0 0 20px;font:400 13px/1.4 ${FONT};color:${INK_SOFT};">Accès équipe — ${escapeHtml(roleLabel)}</p>
								<h1 style="margin:0 0 12px;font:600 22px/1.3 ${FONT};color:${INK};">Bienvenue dans l'équipe !</h1>
								<p style="margin:0 0 16px;font:400 15px/1.5 ${FONT};color:${INK};">
									${greeting}
								</p>
								<p style="margin:0 0 20px;font:400 15px/1.5 ${FONT};color:${INK};">
									Un compte d'accès au tableau de bord vous a été attribué avec le rôle de <strong>${escapeHtml(roleLabel)}</strong>.
									Pour activer votre compte et vous connecter, veuillez définir votre mot de passe en cliquant sur le bouton ci-dessous.
								</p>
							</td>
						</tr>
						<tr>
							<td align="center" style="padding:0 28px 20px;">
								<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;background:${INK};color:#ffffff;font:600 15px/1 ${FONT};text-decoration:none;border-radius:10px;">
									Définir mon mot de passe
								</a>
							</td>
						</tr>
						<tr>
							<td style="padding:0 28px 20px;">
								<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FOAM};border:1px solid ${BORDER};border-radius:10px;">
									<tr>
										<td style="padding:14px 16px;">
											<p style="margin:0 0 6px;font:600 12px/1.4 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${INK_SOFT};">Si le bouton ne fonctionne pas</p>
											<p style="margin:0 0 8px;font:400 13px/1.5 ${FONT};color:${INK_SOFT};">Copiez ce lien dans votre navigateur :</p>
											<p style="margin:0;font:400 12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:${INK};word-break:break-all;">${escapeHtml(url)}</p>
										</td>
									</tr>
								</table>
							</td>
						</tr>
						<tr>
							<td style="padding:0 28px 28px;">
								<p style="margin:0 0 12px;font:400 13px/1.5 ${FONT};color:${INK_SOFT};">
									Ce lien est valable ${INVITATION_EXPIRY_HOURS} heures et ne fonctionne qu'une fois.
									Si vous ne faites pas partie de l'équipe de ${escapeHtml(store.name)}, vous pouvez ignorer cet email.
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

export function buildTeamInvitationText({
	name,
	role,
	url,
}: {
	name?: string;
	role?: string;
	url: string;
}): string {
	const greeting = name ? `Bonjour ${name},` : "Bonjour,";
	const roleLabel = formatRoleLabel(role);

	return [
		`${store.name} — Bienvenue dans l'équipe`,
		"",
		greeting,
		"",
		`Un compte d'accès au tableau de bord vous a été attribué avec le rôle de ${roleLabel}.`,
		"Pour activer votre compte et vous connecter, ouvrez ce lien dans votre navigateur pour définir votre mot de passe :",
		"",
		url,
		"",
		`Ce lien est valable ${INVITATION_EXPIRY_HOURS} heures et ne fonctionne qu'une fois.`,
		`Si vous ne faites pas partie de l'équipe de ${store.name}, vous pouvez ignorer cet email.`,
		"",
		`${store.name} — ${store.fullAddress}`,
	].join("\n");
}

/**
 * Autoriser ou non l'envoi d'une invitation pour `email`.
 */
export async function canSendTeamInvitation(
	email: string,
): Promise<TeamInvitationDecision> {
	const normalized = email.trim().toLowerCase();
	const now = new Date();

	const [teamUser] = await db
		.select({
			id: schema.user.id,
			name: schema.user.name,
			role: schema.user.role,
		})
		.from(schema.user)
		.where(
			and(
				eq(sql`lower(${schema.user.email})`, normalized),
				sql`${schema.user.role} IN ('admin', 'manager')`,
			),
		)
		.limit(1);

	if (!teamUser) {
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

	return {
		ok: true,
		user: {
			id: teamUser.id,
			name: teamUser.name,
			role: teamUser.role as "admin" | "manager",
		},
	};
}

export async function sendTeamInvitationEmail({
	to,
	name,
	role,
	url,
}: {
	to: string;
	name?: string;
	role?: string;
	url: string;
}): Promise<void> {
	const result = await sendEmail({
		to,
		subject: `Bienvenue dans l'équipe ${store.name} — Définissez votre mot de passe`,
		html: buildTeamInvitationHtml({ name, role, url }),
		text: buildTeamInvitationText({ name, role, url }),
	});

	if (result.status === "skipped") {
		console.log(
			`✉️ [INVITATION ÉQUIPE] Lien pour ${to} (${formatRoleLabel(role)}) : ${url}`,
		);
	}
}
