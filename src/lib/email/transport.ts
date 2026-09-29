import { env } from "#/env";

/**
 * Envoi d'email transactionnel.
 *
 * Un transport HTTP nu vers Resend, sans SDK : l'API tient en une requête et
 * le fournisseur reste un détail d'implémentation. Sans clé, l'envoi se
 * contente de journaliser, comme les OTP de Better Auth : le code qui appelle
 * `sendEmail` n'a pas à savoir s'il y a un vrai transport derrière.
 *
 * Règle absolue : cette fonction ne lève jamais. L'appelant est toujours dans
 * un chemin où la réservation est déjà écrite en base, et un email en échec ne
 * doit jamais faire échouer la réservation.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Expéditeur du bac à sable Resend, le seul utilisable sans domaine validé. */
const SANDBOX_FROM = "onboarding@resend.dev";

/**
 * Pièce jointe référencable depuis le HTML par `cid:`. C'est la façon
 * standard d'inliner une image dans un email : Gmail, Outlook et Apple Mail
 * gèrent le MIME lui-même, là où un `data:` URI se fait réécrire ou bloquer.
 */
export type EmailAttachment = {
	filename: string;
	/** Image déjà décodée en mémoire ; l'encodage base64 est fait ici. */
	content: Buffer;
	/** Doit être un identifiant MIME valide : alphanumériques et tirets. */
	contentId: string;
	contentType: string;
};

export type EmailMessage = {
	to: string;
	subject: string;
	html: string;
	/** Repli texte, pour les clients qui refusent le HTML. */
	text: string;
	/** Images inlinées via `<img src="cid:...">`. */
	attachments?: EmailAttachment[];
	/**
	 * Empêche deux envois de la même donnée logique d'être livrés en double.
	 * Ex. `reservation-web-XXXX` : si la requête est rejouée, Resend renvoie
	 * l'identifiant du premier envoi au lieu d'expédier un second mail.
	 */
	idempotencyKey?: string;
};

export type SendResult = {
	status: "sent" | "skipped" | "failed";
	/** Identifiant renvoyé par Resend, présent quand `status === "sent"`. */
	id?: string;
	error?: string;
};

/**
 * Destinataire réel. En développement, `RESEND_TEST_TO` permet de router tout
 * vers une adresse de test sans toucher au code appelant. Ignoré en
 * production : le client doit recevoir son propre mail.
 */
function resolveRecipient(to: string): string {
	if (env.NODE_ENV !== "production" && env.RESEND_TEST_TO) {
		return env.RESEND_TEST_TO;
	}
	return to;
}

function describe(message: EmailMessage): string {
	return [
		`to: ${resolveRecipient(message.to)}`,
		`sujet: ${message.subject}`,
		message.idempotencyKey ? `clé: ${message.idempotencyKey}` : null,
		message.attachments?.length
			? `${message.attachments.length} pièce(s) jointe(s)`
			: null,
	]
		.filter(Boolean)
		.join(" | ");
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
	if (!env.RESEND_API_KEY) {
		console.log(`✉️ [EMAIL] Aucun transport configuré — ${describe(message)}`);
		return { status: "skipped" };
	}

	try {
		const response = await fetch(RESEND_ENDPOINT, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.RESEND_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: env.RESEND_FROM || SANDBOX_FROM,
				to: [resolveRecipient(message.to)],
				subject: message.subject,
				html: message.html,
				text: message.text,
				...(message.attachments?.length
					? {
							attachments: message.attachments.map((attachment) => ({
								filename: attachment.filename,
								// Le corps de la requête est du JSON : un Buffer n'y survit pas.
								content: attachment.content.toString("base64"),
								content_type: attachment.contentType,
								content_id: attachment.contentId,
							})),
						}
					: {}),
				...(message.idempotencyKey
					? { idempotency_key: message.idempotencyKey }
					: {}),
			}),
		});

		if (!response.ok) {
			const error = `HTTP ${response.status} — ${await response.text()}`;
			console.error(`✉️ [EMAIL] Envoi refusé — ${describe(message)} — ${error}`);
			return { status: "failed", error };
		}

		const payload = (await response.json().catch(() => null)) as {
			id?: string;
		} | null;
		console.log(`✉️ [EMAIL] Envoyé — ${describe(message)}`);
		return payload?.id
			? { status: "sent", id: payload.id }
			: { status: "sent" };
	} catch (error) {
		// Réseau coupé, timeout, DNS : on journalise et on laisse la réservation
		// vivre. Un nouvel envoi pourra être déclenché depuis l'admin.
		const reason = error instanceof Error ? error.message : String(error);
		console.error(
			`✉️ [EMAIL] Envoi impossible — ${describe(message)} — ${reason}`,
		);
		return { status: "failed", error: reason };
	}
}
