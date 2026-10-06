import { store } from "#/config/store";
import { type CodeImages, renderCodes } from "#/lib/codes";
import { formatLongDate, rentalDurationLabel } from "#/lib/dates";
import { type EmailAttachment, sendEmail } from "#/lib/email/transport";
import { formatPrice } from "#/stores/public-cart.store";

/**
 * Email de confirmation d'une réservation publique.
 *
 * Le contenu reprend celui de la page de confirmation : même récapitulatif,
 * mêmes modalités, et surtout les mêmes codes de retrait. Le mail est construit
 * en tables et en styles en ligne, sans feuille de style ni flexbox, parce que
 * le rendu des clients de messagerie n'est pas celui d'un navigateur.
 *
 * Les codesbarres Code128 sont produits côté serveur en PNG et référencés en
 * `cid:`, ce qui évite tout hébergement d'image derrière une authentification
 * et passe dans Gmail, Outlook et Apple Mail, là où un SVG est supprimé. Le
 * code en toutes lettres est réécrit sous chaque image : il reste lisible même
 * quand un client de messagerie refuse d'afficher les pièces jointes, et permet
 * au caissier de le saisir au clavier. Un code ne peut pas produire de
 * Code128 lisible : seule la version en toutes lettres est affichée.
 *
 * Une ligne de quantité N produit N codes identiques, empilés et numérotés. C'est
 * volontaire : au comptoir, chaque unité doit être scannée pour que le prix
 * remonte, et un code unique pour trois bâtons se fait scanner une seule fois.
 */

export type ReservationEmailLine = {
	itemName: string;
	variantLabel: string | null;
	durationDays: number;
	quantity: number;
	unitPrice: string;
	/** Code caisse de l'option de prix réservée, vide si la ligne n'en a pas. */
	barcode: string;
};

export type ReservationEmailData = {
	reference: string;
	accessToken: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	pickupDate: string;
	returnDate: string;
	durationDays: number;
	totalPrice: string;
	lines: ReservationEmailLine[];
};

/** Palette claire du site, les variables CSS n'existantant pas dans un mail. */
const INK = "#1f2937";
const INK_SOFT = "#4b5563";
const SAND = "#f3f4f6";
const FOAM = "#f9fafb";
const BORDER = "#e5e7eb";

/** Les noms viennent du client et du catalogue : jamais injectés bruts. */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Ce que la ligne contient, dans l'ordre de la page de confirmation. */
function lineSpecs(line: ReservationEmailLine): string[] {
	return [
		line.variantLabel ? `Variante : ${line.variantLabel}` : null,
		rentalDurationLabel(line.durationDays).toLowerCase(),
	].filter((part): part is string => Boolean(part));
}

function confirmationUrl(data: ReservationEmailData): string {
	return `${store.siteOrigin}/reservation/${encodeURIComponent(data.reference)}?token=${encodeURIComponent(data.accessToken)}`;
}

/** Nombre total d'unités, donc nombre de codes à scanner au comptoir. */
function totalUnits(lines: ReservationEmailLine[]): number {
	return lines.reduce((sum, line) => sum + line.quantity, 0);
}

function row(content: string): string {
	return `<tr><td style="padding:0 24px;">${content}</td></tr>`;
}

function section(content: string): string {
	return `<tr><td style="padding:24px 24px 0;">${content}</td></tr>`;
}

function panel(content: string): string {
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FOAM};border:1px solid ${BORDER};border-radius:12px;margin:0 0 16px 0;"><tr><td style="padding:20px;">${content}</td></tr></table>`;
}

function heading(label: string): string {
	return `<p style="margin:0 0 12px;font:600 12px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${INK_SOFT};">${escapeHtml(label)}</p>`;
}

/** Un code rendu, vu du point de vue du mail : où le retrouver en `cid:`. */
type EmailCodeRefs = {
	barcode: string;
	code128?: { contentId: string; displayWidth: number };
};

/**
 * Attribue un `content_id` à chaque image et renvoie, avec les pièces jointes,
 * la table de correspondance `code -> cid` que le HTML référence.
 *
 * L'identifiant est un simple compteur : il garantit des `content_id` uniques
 * et valides sans avoir à assainir la valeur du code, qui peut contenir
 * n'importe quels caractères.
 */
function emailCodeRefs(rendered: Map<string, CodeImages>): {
	refs: Map<string, EmailCodeRefs>;
	attachments: EmailAttachment[];
} {
	const refs = new Map<string, EmailCodeRefs>();
	const attachments: EmailAttachment[] = [];
	let id = 0;
	for (const images of rendered.values()) {
		const ref: EmailCodeRefs = { barcode: images.barcode };
		if (images.code128) {
			ref.code128 = {
				contentId: `code128-${id}`,
				displayWidth: images.code128.displayWidth,
			};
			attachments.push({
				filename: `code128-${id}.png`,
				content: images.code128.buffer,
				contentId: `code128-${id}`,
				contentType: "image/png",
			});
		}
		refs.set(images.barcode, ref);
		id += 1;
	}
	return { refs, attachments };
}

/**
 * Un code par unité, empilé et numéroté. Vertical plutôt que côte à côte : la
 * largeur d'un Code128 ne se comprime pas, et c'est la lisibilité qui compte
 * quand le caissier balaie l'écran avec son lecteur. La numérotation rend la
 * progression explicite, pour qu'un code sur trois ne soit pas oublié.
 */
function codeUnit(
	rendered: EmailCodeRefs,
	index: number,
	total: number,
): string {
	const code = escapeHtml(rendered.barcode);
	return `
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px 0;">
			<tr>
				<td align="center" style="padding:12px;background:#ffffff;border:1px solid ${BORDER};border-radius:10px;">
					${
						total > 1
							? `<p style="margin:0 0 10px;font:600 11px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${INK_SOFT};">Code ${index + 1} sur ${total}</p>`
							: ""
					}
					${
						rendered.code128
							? `<img src="cid:${rendered.code128.contentId}" width="${rendered.code128.displayWidth}" alt="Code-barres ${code}" style="display:block;margin:0 auto;max-width:100%;height:auto;" />`
							: ""
					}
					<p style="margin:${rendered.code128 ? "12px" : "0"} 0 0;font:600 15px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:${INK};letter-spacing:.04em;">${code}</p>
					<p style="margin:6px 0 0;font:400 12px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">
						Si le code ne se scanne pas, dictez-le au comptoir.
					</p>
				</td>
			</tr>
		</table>`;
}

function codesPanel(
	lines: ReservationEmailLine[],
	rendered: Map<string, EmailCodeRefs>,
): string {
	const withCode = lines.filter((line) => line.barcode);
	if (withCode.length === 0) return "";

	const blocks: string[] = [];
	for (const line of withCode) {
		const code = rendered.get(line.barcode);
		if (!code) continue;
		const units = Array.from({ length: line.quantity }, (_, index) =>
			codeUnit(code, index, line.quantity),
		).join("");
		blocks.push(`
			<p style="margin:0 0 8px;font:600 15px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
				${escapeHtml(`${line.quantity} × ${line.itemName}`)}
				<span style="font-weight:400;color:${INK_SOFT};">${escapeHtml(lineSpecs(line).join(" · "))}</span>
			</p>
			<p style="margin:0 0 10px;font:400 13px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">
				À scanner en caisse : <strong>${line.quantity} fois le code ${escapeHtml(line.barcode)}</strong>.
			</p>
			${units}
		`);
	}

	const units = totalUnits(withCode);
	return panel(`
		${heading("Codes de retrait")}
		<p style="margin:0 0 16px;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
			Présentez ces codes au comptoir : le prix est appliqué automatiquement.
			${units > 1 ? `Vous avez réservé ${units} article${units > 1 ? "s" : ""} : <strong>il faut scanner ${units} codes</strong>.` : "Un seul code est à scanner."}
		</p>
		${blocks.join("")}
	`);
}

function summaryTable(data: ReservationEmailData): string {
	const rows = data.lines
		.map(
			(line) => `
			<tr>
				<td style="padding:8px 0;border-bottom:1px solid ${BORDER};font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
					<strong>${escapeHtml(`${line.quantity} × ${line.itemName}`)}</strong>
					<br />
					<span style="color:${INK_SOFT};font-size:13px;">${escapeHtml(lineSpecs(line).join(" · "))}</span>
				</td>
				<td align="right" valign="top" style="padding:8px 0;border-bottom:1px solid ${BORDER};white-space:nowrap;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
					${escapeHtml(formatPrice(Number(line.unitPrice) * line.quantity))}
				</td>
			</tr>`,
		)
		.join("");

	return panel(`
		${heading("Votre location")}
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
			<tr>
				<td style="font:600 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">Retrait</td>
				<td align="right" style="font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
					${escapeHtml(formatLongDate(data.pickupDate))}
				</td>
			</tr>
			<tr>
				<td style="font:600 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">Retour</td>
				<td align="right" style="font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
					${escapeHtml(formatLongDate(data.returnDate))}
					<span style="color:${INK_SOFT};font-size:13px;">(${escapeHtml(rentalDurationLabel(data.durationDays).toLowerCase())})</span>
				</td>
			</tr>
		</table>
		${rows}
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
			<tr>
				<td style="padding-top:12px;font:600 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">Total à régler au magasin</td>
				<td align="right" style="padding-top:12px;font:600 18px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
					${escapeHtml(formatPrice(Number(data.totalPrice)))}
				</td>
			</tr>
		</table>
	`);
}

function pickupPanel(): string {
	return panel(`
		${heading("Retrait au comptoir")}
		<p style="margin:0 0 8px;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
			<strong>${escapeHtml(store.fullAddress)}</strong>
			<br />
			<a href="${escapeHtml(store.phoneHref)}" style="color:${INK_SOFT};text-decoration:underline;">${escapeHtml(store.phone)}</a>
		</p>
		<p style="margin:0;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">
			${escapeHtml(store.paymentNotice)}<br />
			Retrait ${escapeHtml(store.pickupWindow)}, retour ${escapeHtml(store.returnWindow)}.
		</p>
	`);
}

function buildHtml(data: ReservationEmailData, codes: string): string {
	const url = confirmationUrl(data);
	return `<!doctype html>
<html lang="fr">
	<body style="margin:0;padding:0;background:${SAND};">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SAND};">
			<tr>
				<td align="center" style="padding:24px 12px;">
					<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
						${row(`
							<p style="margin:0 0 4px;font:600 18px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">${escapeHtml(store.name)}</p>
							<p style="margin:0 0 16px;font:400 13px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">Réservation confirmée</p>
							<h1 style="margin:0 0 12px;font:600 22px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">Bonjour ${escapeHtml(data.firstName)},</h1>
							<p style="margin:0 0 16px;font:400 15px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
								Votre réservation est enregistrée. Présentez-vous au comptoir location de ${escapeHtml(store.city)} avec cette page.
							</p>
							<table role="presentation" cellpadding="0" cellspacing="0" style="background:${FOAM};border:1px solid ${BORDER};border-radius:10px;">
								<tr>
									<td style="padding:12px 16px;">
										<p style="margin:0 0 2px;font:400 12px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">Votre référence</p>
										<p style="margin:0;font:600 20px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:${INK};letter-spacing:.06em;">${escapeHtml(data.reference)}</p>
									</td>
								</tr>
							</table>
						`)}
						${section(summaryTable(data))}
						${section(codes)}
						${section(pickupPanel())}
						${section(
							`<p style="margin:0 0 12px;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
								<a href="${escapeHtml(url)}" style="color:${INK};font-weight:600;">Consulter cette réservation en ligne</a>
							</p>`,
						)}
						${section(cancelHintHtml())}
						${row(`
							<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${BORDER};font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">
								${escapeHtml(store.name)} — ${escapeHtml(store.fullAddress)}<br />
								${escapeHtml(store.phone)}<br />
								Ce mail est généré automatiquement, merci de ne pas y répondre.
							</p>
						`)}
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>`;
}

function buildText(data: ReservationEmailData): string {
	const lines = data.lines.map(
		(line) =>
			`  - ${line.quantity} x ${line.itemName} (${lineSpecs(line).join(", ")}) : ${formatPrice(Number(line.unitPrice) * line.quantity)}${line.barcode ? `\n    Code a scanner en caisse ${line.quantity} fois : ${line.barcode}` : ""}`,
	);
	const units = totalUnits(data.lines);

	return [
		`Bonjour ${data.firstName},`,
		"",
		`Votre reservation est confirmee. presents-toi au comptoir location de ${store.city} avec cette page.`,
		"",
		`Reference : ${data.reference}`,
		`Retrait : ${formatLongDate(data.pickupDate)}`,
		`Retour : ${formatLongDate(data.returnDate)} (${rentalDurationLabel(data.durationDays).toLowerCase()})`,
		"",
		"Votre location :",
		...lines,
		"",
		`Total a regler au magasin : ${formatPrice(Number(data.totalPrice))}`,
		"",
		units > 1
			? `Vous avez reserve ${units} article(s) : il faut scanner ${units} codes.`
			: "Un seul code est a scanner.",
		"",
		`${store.paymentNotice}`,
		`Retrait ${store.pickupWindow}, retour ${store.returnWindow}.`,
		"",
		`${store.name} - ${store.fullAddress}`,
		store.phone,
		"",
		confirmationUrl(data),
		cancelHintText(),
	].join("\n");
}

/** Espace client : c'est là que se.Connecte la session, pas via un lien. */
function accountUrl(): string {
	return `${store.siteOrigin}/mon-compte`;
}

/**
 * Rappel que la réservation peut être annulée en ligne.
 *
 * Le lien de cette section est volontairement l'espace client, et non la page de
 * confirmation : `/reservation/{ref}?token=…` repose sur un jeton qui circule par
 * mail, alors que l'annulation se prouve par session. Le client doit donc se
 * connecter **avec l'email de la réservation** — c'est dit explicitement, sinon il
 * se connecte, ne voit rien, et conclut que l'annulation est impossible.
 */
function cancelHintHtml(): string {
	return `<p style="margin:0;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">
						Vous pouvez annuler cette réservation sans frais depuis votre espace,
						en vous connectant avec l'adresse email utilisée pour la réserver :
						<a href="${escapeHtml(accountUrl())}" style="color:${INK};font-weight:600;">${escapeHtml(accountUrl())}</a>.
					</p>`;
}

/** Même information que `cancelHintHtml`, en version texte. */
function cancelHintText(): string {
	return `Vous pouvez annuler cette reservation sans frais depuis votre espace : ${accountUrl()} (connectez-vous avec l'email de la reservation).`;
}

export type BuiltReservationEmail = {
	subject: string;
	html: string;
	text: string;
	/** PNG à référencer en `cid:` depuis le HTML. */
	attachments: EmailAttachment[];
};

export async function buildReservationEmail(
	data: ReservationEmailData,
): Promise<BuiltReservationEmail> {
	const rendered = await renderCodes(data.lines.map((line) => line.barcode));
	const { refs, attachments } = emailCodeRefs(rendered);
	return {
		subject: `Votre réservation ${data.reference} — ${store.name}`,
		html: buildHtml(data, codesPanel(data.lines, refs)),
		text: buildText(data),
		attachments,
	};
}

/**
 * Envoie le récapitulatif. Ne lève jamais : la réservation est déjà écrite, un
 * mail en échec ne doit pas la faire perdre. Le destinataire est l'email du
 * client, lu sur la réservation.
 */
export async function sendReservationConfirmationEmail(
	data: ReservationEmailData,
): Promise<void> {
	const { subject, html, text, attachments } =
		await buildReservationEmail(data);
	await sendEmail({
		to: data.email,
		subject,
		html,
		text,
		attachments,
		idempotencyKey: `reservation-web-${data.reference}`,
	});
}

/** Ce qu'on sait d'une réservation annulée, pour l'email d'annulation. */
export type CancellationEmailData = {
	reference: string;
	firstName: string;
	email: string;
	pickupDate: string;
	returnDate: string;
};

function buildCancellationHtml(data: CancellationEmailData): string {
	// Le bloc encadré est construit à part : imbriquer un gabarit multiligne dans
	// une interpolation court-circuite le gabarit externe.
	const referencePanel = panel(`
		<p style="margin:0 0 2px;font:400 12px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">Référence</p>
		<p style="margin:0 0 12px;font:600 20px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:${INK};letter-spacing:.06em;">${escapeHtml(data.reference)}</p>
		<p style="margin:0;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
			Retrait ${escapeHtml(formatLongDate(data.pickupDate))} · retour ${escapeHtml(formatLongDate(data.returnDate))}
		</p>
	`);

	const againHint = section(
		`<p style="margin:0;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">
			Vous pouvez refaire une réservation à tout moment depuis le site.
		</p>`,
	);

	const footer = row(
		`<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${BORDER};font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">
			${escapeHtml(store.name)} — ${escapeHtml(store.fullAddress)}<br />
			${escapeHtml(store.phone)}<br />
			Ce mail est généré automatiquement, merci de ne pas y répondre.
		</p>`,
	);

	const body = row(`
		<p style="margin:0 0 4px;font:600 18px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">${escapeHtml(store.name)}</p>
		<p style="margin:0 0 16px;font:400 13px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK_SOFT};">Réservation annulée</p>
		<h1 style="margin:0 0 12px;font:600 22px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">Bonjour ${escapeHtml(data.firstName)},</h1>
		<p style="margin:0 0 16px;font:400 15px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
			Votre réservation a bien été annulée. Le matériel est de nouveau disponible à la location.
		</p>
	`);

	return `<!doctype html>
<html lang="fr">
	<body style="margin:0;padding:0;background:${SAND};">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SAND};">
			<tr>
				<td align="center" style="padding:24px 12px;">
					<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
						${body}
						${referencePanel}
						${againHint}
						${footer}
					</table>
					</td>
			</tr>
		</table>
	</body>
</html>`;
}

function buildCancellationText(data: CancellationEmailData): string {
	return [
		`Bonjour ${data.firstName},`,
		"",
		`Votre reservation ${data.reference} a bien ete annulee. Le materiel est de nouveau disponible a la location.`,
		"",
		`Retrait : ${formatLongDate(data.pickupDate)}`,
		`Retour : ${formatLongDate(data.returnDate)}`,
		"",
		`Vous pouvez refaire une reservation a tout moment depuis le site.`,
		"",
		`${store.name} - ${store.fullAddress}`,
		store.phone,
	].join("\n");
}

/**
 * Confirme l'annulation au client.
 *
 * Même règle que l'email de confirmation : ne lève jamais. La réservation est
 * déjà annulée en base quand on arrive ici, un mail en échec ne doit pas la
 * remittre en cause. La clé d'idempotence est distincte de celle de la
 * confirmation pour que les deux envois d'une même réservation passent tous les
 * deux — c'est la même logique de données, pas le même message.
 */
export async function sendReservationCancellationEmail(
	data: CancellationEmailData,
): Promise<void> {
	const { subject, html, text } = buildReservationCancellationEmail(data);
	await sendEmail({
		to: data.email,
		subject,
		html,
		text,
		idempotencyKey: `reservation-cancel-${data.reference}`,
	});
}

/**
 * Assemble l'email d'annulation. Séparé de l'envoi pour être vérifiable : un
 * gabarit cassé ne se voit pas à la lecture, il se voit au rendu en boîte mail.
 */
export function buildReservationCancellationEmail(
	data: CancellationEmailData,
): {
	subject: string;
	html: string;
	text: string;
} {
	return {
		subject: `Réservation ${data.reference} annulée — ${store.name}`,
		html: buildCancellationHtml(data),
		text: buildCancellationText(data),
	};
}
