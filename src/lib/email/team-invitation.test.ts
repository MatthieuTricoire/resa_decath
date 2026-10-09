import { describe, expect, it } from "vitest";
import {
	buildTeamInvitationHtml,
	buildTeamInvitationText,
} from "./team-invitation";

describe("Team invitation email", () => {
	it("renders HTML email with balanced tables and required elements", () => {
		const html = buildTeamInvitationHtml({
			name: "Sophie Martin",
			role: "manager",
			url: "https://example.com/api/auth/reset-password/tok123?callbackURL=%2Fadmin%2Fdefinir-mot-de-passe",
		});

		expect(html).toContain("Sophie Martin");
		expect(html).toContain("Gérant");
		expect(html).toContain("Définir mon mot de passe");
		expect(html.split("<table").length).toBe(html.split("</table>").length);
		expect(html.split("<tr").length).toBe(html.split("</tr>").length);
		expect(html.split("<td").length).toBe(html.split("</td>").length);
	});

	it("renders plain text email with the activation link", () => {
		const text = buildTeamInvitationText({
			name: "Alexandre",
			role: "admin",
			url: "https://example.com/api/auth/reset-password/tok123?callbackURL=%2Fadmin%2Fdefinir-mot-de-passe",
		});

		expect(text).toContain("Bonjour Alexandre");
		expect(text).toContain("Administrateur");
		expect(text).toContain(
			"https://example.com/api/auth/reset-password/tok123?callbackURL=%2Fadmin%2Fdefinir-mot-de-passe",
		);
	});
});
