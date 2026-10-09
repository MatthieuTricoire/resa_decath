import { describe, expect, it } from "vitest";
import {
	inviteTeamMemberSchema,
	setPasswordSchema,
} from "./create-team-account.schema";

describe("Team account schemas", () => {
	describe("inviteTeamMemberSchema", () => {
		it("validates valid invitation data without password", () => {
			const result = inviteTeamMemberSchema.safeParse({
				name: "Claire Lefebvre",
				email: "claire@decathlon.fr",
				role: "manager",
			});
			expect(result.success).toBe(true);
		});

		it("rejects missing name or invalid email", () => {
			const result = inviteTeamMemberSchema.safeParse({
				name: "",
				email: "not-an-email",
				role: "admin",
			});
			expect(result.success).toBe(false);
		});

		it("rejects unauthorized roles", () => {
			const result = inviteTeamMemberSchema.safeParse({
				name: "Luc",
				email: "luc@example.fr",
				role: "superadmin",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("setPasswordSchema", () => {
		it("accepts valid matching passwords of 8+ characters", () => {
			const result = setPasswordSchema.safeParse({
				password: "SuperSecretPassword123!",
				confirmPassword: "SuperSecretPassword123!",
			});
			expect(result.success).toBe(true);
		});

		it("rejects passwords shorter than 8 characters", () => {
			const result = setPasswordSchema.safeParse({
				password: "short",
				confirmPassword: "short",
			});
			expect(result.success).toBe(false);
		});

		it("rejects mismatched passwords", () => {
			const result = setPasswordSchema.safeParse({
				password: "ValidPassword123",
				confirmPassword: "DifferentPassword456",
			});
			expect(result.success).toBe(false);
		});
	});
});
