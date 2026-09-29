import { describe, expect, it } from "vitest";
import {
	generatedReferencePattern,
	generateReservationAccessToken,
	generateReservationReference,
	isValidAccessToken,
	reservationReferencePattern,
} from "./reservation-reference";

describe("generateReservationReference", () => {
	it("produit une référence préfixée et lisible", () => {
		const reference = generateReservationReference();
		expect(reference).toMatch(generatedReferencePattern);
		expect(reference.startsWith("RES-")).toBe(true);
	});

	it("n'utilise jamais de caractère ambigu (0/O, 1/I/L)", () => {
		for (let i = 0; i < 200; i += 1) {
			const body = generateReservationReference().slice(4);
			expect(body).not.toMatch(/[01ILO]/);
		}
	});

	it("varie d'un appel à l'autre", () => {
		const references = new Set(
			Array.from({ length: 100 }, () => generateReservationReference()),
		);
		expect(references.size).toBeGreaterThan(95);
	});
});

describe("reservationReferencePattern", () => {
	it("accepte les références backfillées depuis un uuid (hex, 8 à 16 caractères)", () => {
		expect(reservationReferencePattern.test("RES-0A1B2C3D")).toBe(true);
		expect(reservationReferencePattern.test("RES-0123456789ABCDEF")).toBe(true);
	});

	it("accepte les références générées", () => {
		expect(
			reservationReferencePattern.test(generateReservationReference()),
		).toBe(true);
	});

	it("refuse un format invalide", () => {
		expect(reservationReferencePattern.test("RES-TOO-SHORT")).toBe(false);
		expect(reservationReferencePattern.test("ABCDEFGH")).toBe(false);
		expect(reservationReferencePattern.test("RES-abc123")).toBe(false);
	});
});

describe("generateReservationAccessToken", () => {
	it("produit un jeton hexadécimal de 48 caractères", () => {
		const token = generateReservationAccessToken();
		expect(token).toHaveLength(48);
		expect(isValidAccessToken(token)).toBe(true);
	});

	it("ne produit jamais deux fois le même jeton", () => {
		expect(generateReservationAccessToken()).not.toBe(
			generateReservationAccessToken(),
		);
	});
});

describe("isValidAccessToken", () => {
	it("refuse les valeurs invalides", () => {
		expect(isValidAccessToken(null)).toBe(false);
		expect(isValidAccessToken(undefined)).toBe(false);
		expect(isValidAccessToken("")).toBe(false);
		expect(isValidAccessToken("zz".repeat(24))).toBe(false);
		expect(isValidAccessToken("a".repeat(47))).toBe(false);
	});
});
