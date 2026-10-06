/**
 * Rendu des emails de réservation.
 *
 * Ce fichier existe pour une seule famille de bugs : un gabarit HTML cassé. Une
 * balise non fermée ne fait pas échouer TypeScript — `buildHtml` renvoie une
 * chaîne, quoi qu'il y ait dedans — et ne se voit pas à la relecture. Elle se
 * voit dans la boîte de réception, où le client voit le message se défaire.
 *
 * D'où le comptage de `<table>` contre `</table>` plutôt qu'une assertion de
 * contenu : le contenu change à chaque retouche de design, l'équilibre des
 * balises, non.
 */
import { describe, expect, it } from "vitest";
import {
	buildReservationCancellationEmail,
	buildReservationEmail,
} from "#/lib/email/reservation-email";

const confirmation = {
	reference: "RES-ABC123",
	accessToken: "token-de-test",
	firstName: "Marie",
	lastName: "Dupont",
	email: "marie@example.fr",
	phone: "0600000000",
	pickupDate: "2026-07-04",
	returnDate: "2026-07-08",
	durationDays: 5,
	totalPrice: "120.00",
	lines: [
		{
			itemName: "Tente 2 places",
			variantLabel: null,
			durationDays: 5,
			quantity: 1,
			unitPrice: "120.00",
			barcode: "",
		},
	],
};

/** Chaque balise ouvrante a sa fermante. */
function expectBalanced(html: string): void {
	for (const tag of ["table", "tr", "td"]) {
		const open = html.match(new RegExp(`<${tag}[\\s>]`, "g"))?.length ?? 0;
		const close = html.match(new RegExp(`</${tag}>`, "g"))?.length ?? 0;
		expect(`${tag}: ${open}/${close}`).toBe(`${tag}: ${open}/${open}`);
	}
}

/** Aucune interpolation laissée brute : le gabarit aurait été mal refermé. */
function expectNoLeftover(html: string): void {
	expect(html).not.toContain("${");
	expect(html.trimEnd().endsWith("</html>")).toBe(true);
}

describe("email de confirmation", () => {
	it("produit un HTML équilibré", async () => {
		const { html } = await buildReservationEmail(confirmation);
		expectBalanced(html);
		expectNoLeftover(html);
	});

	it("annonce l'annulation en ligne, en HTML et en texte", async () => {
		const { html, text } = await buildReservationEmail(confirmation);
		// Sans cette phrase, le client ne sait pas que la réservation est
		// annulable depuis son compte.
		expect(html).toContain("/mon-compte");
		expect(text).toContain("/mon-compte");
		// Et il doit savoir avec quel compte se connecter.
		expect(html).toContain("l'adresse email utilisée pour la réserver");
		expect(text).toContain("email de la reservation");
	});

	it("échappe le contenu venant du client", async () => {
		const { html } = await buildReservationEmail({
			...confirmation,
			firstName: "<script>alert(1)</script>",
		});
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});
});

describe("email d'annulation", () => {
	const cancellation = {
		reference: "RES-ABC123",
		firstName: "Marie",
		email: "marie@example.fr",
		pickupDate: "2026-07-04",
		returnDate: "2026-07-08",
	};

	it("produit un HTML équilibré", () => {
		const { html } = buildReservationCancellationEmail(cancellation);
		expectBalanced(html);
		expectNoLeftover(html);
	});

	it("reprend la référence et les deux dates", () => {
		const { html, text, subject } =
			buildReservationCancellationEmail(cancellation);
		expect(subject).toContain("RES-ABC123");
		expect(html).toContain("RES-ABC123");
		expect(text).toContain("RES-ABC123");
		// Les deux dates en toutes lettres : une réservation annulée ne se restitue
		// pas sur la seule référence, le client veut savoir ce qu'il vient de
		// rendre. On compare au rendu réel plutôt qu'à un motif — « 4 juillet »
		// n'a pas de zéro initial.
		for (const field of [html, text]) {
			expect(field).toContain("4 juillet 2026");
			expect(field).toContain("8 juillet 2026");
		}
	});

	it("ne prétend pas rembourser", () => {
		// Le paiement se fait au magasin : promettre un remboursement dans l'email
		// créerait un litige que personne n'a demandé.
		const { html, text } = buildReservationCancellationEmail({
			reference: "RES-ABC123",
			firstName: "Marie",
			email: "marie@example.fr",
			pickupDate: "2026-07-04",
			returnDate: "2026-07-08",
		});
		expect(`${html}${text}`).not.toMatch(/rembours|remboursé|rembourse/i);
	});

	it("échappe le prénom", () => {
		const { html, text } = buildReservationCancellationEmail({
			...cancellation,
			firstName: "<b>Marie</b>",
		});
		expect(html).not.toContain("<b>Marie</b>");
		expect(text).toContain("<b>Marie</b>");
	});
});
