import { describe, expect, it } from "vitest";
import { validateClient } from "./client-validation";

const existingUserIds = ["user-1", "user-2"];

describe("validateClient", () => {
	it("refuse un client existant non sélectionné", () => {
		const result = validateClient({
			mode: "existing",
			selectedUserId: "",
			knownUserIds: existingUserIds,
		});

		expect(result.valid).toBe(false);
		expect(result.errors.user).toBe("Sélectionnez un client");
	});

	it("refuse un identifiant client inconnu", () => {
		const result = validateClient({
			mode: "existing",
			selectedUserId: "user-obsolete",
			knownUserIds: existingUserIds,
		});

		expect(result.valid).toBe(false);
		expect(result.errors.user).toBe("Sélectionnez un client");
	});

	it("accepte un client existant connu", () => {
		const result = validateClient({
			mode: "existing",
			selectedUserId: "user-2",
			knownUserIds: existingUserIds,
		});

		expect(result).toEqual({ valid: true, errors: {} });
	});

	it("refuse un nouveau client incomplet", () => {
		const result = validateClient({
			mode: "new",
			name: "",
			email: "jean@exemple.fr",
			phone: "   ",
		});

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual({
			name: "Le nom est requis",
			phone: "Le téléphone est requis",
		});
	});

	it("refuse un email invalide", () => {
		const result = validateClient({
			mode: "new",
			name: "Jean Dupont",
			email: "jean",
			phone: "0612345678",
		});

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual({ email: "Email invalide" });
	});

	it("accepte un nouveau client complet avec des espaces superflus", () => {
		const result = validateClient({
			mode: "new",
			name: "  Jean Dupont  ",
			email: " jean@exemple.fr ",
			phone: " 0612345678 ",
		});

		expect(result).toEqual({ valid: true, errors: {} });
	});
});
