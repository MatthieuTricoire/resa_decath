import { describe, expect, it } from "vitest";
import { calculateMonthBilling } from "#/features/billing/queries";

describe("calculateMonthBilling", () => {
	const defaultSettings = {
		monthlyFee: 30,
		commissionRateWeb: 10,
		commissionRateStore: 5,
	};

	it("calcule correctement pour un mois sans réservation", () => {
		const result = calculateMonthBilling({
			webRevenue: 0,
			storeRevenue: 0,
			webReservationCount: 0,
			storeReservationCount: 0,
			settings: defaultSettings,
		});

		expect(result).toEqual({
			revenue: 0,
			webRevenue: 0,
			storeRevenue: 0,
			reservationCount: 0,
			webReservationCount: 0,
			storeReservationCount: 0,
			webCommission: 0,
			storeCommission: 0,
			commission: 0,
			monthlyFee: 30,
			totalDue: 30,
		});
	});

	it("calcule la commission avec uniquement des réservations Web (10 %)", () => {
		const result = calculateMonthBilling({
			webRevenue: 1000,
			storeRevenue: 0,
			webReservationCount: 15,
			storeReservationCount: 0,
			settings: defaultSettings,
		});

		expect(result.revenue).toBe(1000);
		expect(result.reservationCount).toBe(15);
		expect(result.webCommission).toBe(100);
		expect(result.storeCommission).toBe(0);
		expect(result.commission).toBe(100);
		expect(result.totalDue).toBe(130);
	});

	it("calcule la commission avec uniquement des réservations Magasin (5 %)", () => {
		const result = calculateMonthBilling({
			webRevenue: 0,
			storeRevenue: 800,
			webReservationCount: 0,
			storeReservationCount: 10,
			settings: defaultSettings,
		});

		expect(result.revenue).toBe(800);
		expect(result.reservationCount).toBe(10);
		expect(result.webCommission).toBe(0);
		expect(result.storeCommission).toBe(40);
		expect(result.commission).toBe(40);
		expect(result.totalDue).toBe(70);
	});

	it("calcule la commission mixte avec taux différenciés (10 % Web et 5 % Magasin)", () => {
		const result = calculateMonthBilling({
			webRevenue: 2000,
			storeRevenue: 1000,
			webReservationCount: 20,
			storeReservationCount: 10,
			settings: defaultSettings,
		});

		expect(result.revenue).toBe(3000);
		expect(result.webRevenue).toBe(2000);
		expect(result.storeRevenue).toBe(1000);
		expect(result.reservationCount).toBe(30);
		expect(result.webCommission).toBe(200); // 2000 * 10%
		expect(result.storeCommission).toBe(50); // 1000 * 5%
		expect(result.commission).toBe(250); // 200 + 50
		expect(result.totalDue).toBe(280); // 30 + 250
	});

	it("gère les taux de commission nuls (0 %)", () => {
		const result = calculateMonthBilling({
			webRevenue: 1500,
			storeRevenue: 500,
			webReservationCount: 12,
			storeReservationCount: 4,
			settings: {
				monthlyFee: 50,
				commissionRateWeb: 0,
				commissionRateStore: 0,
			},
		});

		expect(result.webCommission).toBe(0);
		expect(result.storeCommission).toBe(0);
		expect(result.commission).toBe(0);
		expect(result.totalDue).toBe(50);
	});
});
