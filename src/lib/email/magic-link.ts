import { and, count, eq, gt, like, sql } from "drizzle-orm";
import { store } from "#/config/store";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { sendEmail } from "#/lib/email/transport";

/**
 * Email de connexion par lien cliquable.
 *
 * Un bouton, pas de code à recopier : le client clique et il est connecté. Le
 * style suit celui de l'email de réservation — tables et styles en ligne, parce
 * que le rendu d'un client de messagerie n'est pas celui d'un navigateur.
 *
 * L'URL est aussi écrite en toutes lettres sous le bouton. C'est volontaire :
 * Gmail et Outlook déplacent ou bloquent parfois le bouton, et un lien de
 * connexion qu'on ne peut pas cliquer est un lien de connexion raté. Il n'y a
 * rien de sensible à cacher ici, c'est un jeton à usage unique et à durée
 * courte.
 *
 * Comme `sendEmail` ne lève jamais, un échec d'envoi ne peut pas faire échouer
 * la demande de lien : le client est simplement invité à réessayer.
 */

/** Palette claire du site, les variables CSS n'existant pas dans un mail. */
const INK = "#1f2937";
const INK_SOFT = "#4b5563";
const SAND = "#f3f4f6";
const FOAM = "#f9fafb";
const BORDER = "#e5e7eb";

/** Doit rester cohérent avec `expiresIn` dans le plugin magicLink. */
const EXPIRY_MINUTES = 15;

/**
 * Garde-fou d'envoi des liens magiques.
 *
 * Le formulaire `/connexion` est une surface publique et donc spammable : sans
 * garde-fou, n'importe qui épuiserait le quota Resend (100 emails/jour) en
 * demandant des liens pour des adresses inventées. Le salaire de chaque
 * demandeur est donc borné à 5 liens/24 h et le salaire global du site à 70,
 * laissant ~30 emails/jour aux confirmations de réservation (flux séparé, non
 * bridé ici).
 *
 * Chaque envoi réel pose une ligne-sentinelle dans `verification` (identifiant
 * `magic-link-sent:<email>`), expirée en 24 h : elle sert de compteur pour les
 * plafonds, et l'expiration fait le ménage toute seule — aucune migration,
 * aucune purge à écrire. C'est le même champ `identifier` que le plugin, mais
 * ces identifiants ne sont jamais consultés par lui.
 *
 * La réponse HTTP reste 200 uniforme même quand on refuse d'envoyer : le
 * plugin répond après notre callback quoi qu'il arrive. Un demandeur ne peut
 * donc pas deviner quels emails ont réservé, et la ligne `verification` du
 * plugin créée avant notre callback (pour une adresse inconnue) est laissée à
 * son expiration normale de 15 minutes.
 */
const SENTINEL_PREFIX = "magic-link-sent:";
const PER_EMAIL_MAX_SENDS = 5;
const GLOBAL_MAX_SENDS = 70;
const SENTINEL_WINDOW_MS = 24 * 60 * 60 * 1000;

export type MagicLinkDecision =
	| { ok: true }
	| { ok: false; reason: "no-user" | "email-cap" | "global-cap" };

const FONT = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function buildHtml(url: string): string {
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
								<p style="margin:0 0 20px;font:400 13px/1.4 ${FONT};color:${INK_SOFT};">Votre espace client</p>
								<h1 style="margin:0 0 12px;font:600 22px/1.3 ${FONT};color:${INK};">Accéder à mes locations</h1>
								<p style="margin:0 0 20px;font:400 15px/1.5 ${FONT};color:${INK};">
									Retrouvez vos locations en cours, vos codes de retrait et votre historique,
									sans avoir à chercher un ancien mail.
								</p>
							</td>
						</tr>
						<tr>
							<td align="center" style="padding:0 28px 20px;">
								<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;background:${INK};color:#ffffff;font:600 15px/1 ${FONT};text-decoration:none;border-radius:10px;">
									Ouvrir mon compte
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
									Ce lien est valable ${EXPIRY_MINUTES} minutes et ne fonctionne qu'une fois.
									Si vous n'avez pas demandé cette connexion, vous pouvez ignorer ce mail.
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

function buildText(url: string): string {
	return [
		`${store.name} — Accéder à mes locations`,
		"",
		"Retrouvez vos locations en cours, vos codes de retrait et votre historique,",
		"sans avoir à chercher un ancien mail.",
		"",
		"Pour vous connecter, ouvrez ce lien dans votre navigateur :",
		url,
		"",
		`Ce lien est valable ${EXPIRY_MINUTES} minutes et ne fonctionne qu'une fois.`,
		"Si vous n'avez pas demandé cette connexion, vous pouvez ignorer ce mail.",
		"",
		`${store.name} — ${store.fullAddress}`,
	].join("\n");
}

/**
 * Autoriser ou non l'envoi d'un lien magique pour `email`.
 *
 * Contrôles dans l'ordre : l'adresse doit appartenir à une ligne `user`
 * (insensible à la casse, `upsertPublicUser` entre l'email tel que tapé
 * pendant la réservation), puis les plafonds par email et global sur les 24 h
 * glissantes. Si tout passe, un jalon est posé dans `verification` et la
 * fonction dit `ok` — l'envoi n'a plus qu'à suivre.
 */
export async function canSendMagicLink(
	email: string,
): Promise<MagicLinkDecision> {
	const normalized = email.trim().toLowerCase();
	const now = new Date();

	const [customer] = await db
		.select({ id: schema.user.id })
		.from(schema.user)
		.where(eq(sql`lower(${schema.user.email})`, normalized));
	if (!customer) {
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

export async function sendMagicLinkEmail({
	to,
	url,
}: {
	to: string;
	url: string;
}): Promise<void> {
	await sendEmail({
		to,
		subject: "Votre lien de connexion",
		html: buildHtml(url),
		text: buildText(url),
	});
}
