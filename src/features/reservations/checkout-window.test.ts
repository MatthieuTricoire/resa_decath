import { describe, expect, it } from "vitest";
import {
	blockedCheckoutDurations,
	resolveCheckoutWindow,
} from "./checkout-window";

/**
 * Le 11 avril 2026 est un samedi, le 12 un dimanche, le 13 un lundi, le 10 un
 * vendredi. Toute la règle tient sur ces jours : chaque jour est ouvert ou fermé
 * selon la configuration de l'admin.
 */
const VENDREDI = "2026-04-10";
const SAMEDI = "2026-04-11";
const DIMANCHE = "2026-04-12";
const LUNDI = "2026-04-13";

const HORS_DIMANCHE = { openDays: [1, 2, 3, 4, 5, 6] };
const TOUS_LES_JOURS = { openDays: [0, 1, 2, 3, 4, 5, 6] };
const TOUTES_DUREES = [1, 2, 3, 7];

const options = (...durations: number[]) =>
	durations.map((duration) => ({
		id: `opt-${duration}`,
		duration,
		label: `${duration}j`,
		price: "20.00",
	}));

describe("resolveCheckoutWindow", () => {
	it("déduit le retour de la durée, bornes incluses", () => {
		const window = resolveCheckoutWindow({
			pickupDate: SAMEDI,
			requestedDuration: 1,
			durations: TOUTES_DUREES,
			settings: HORS_DIMANCHE,
		});
		// 1 jour = un retrait le samedi, rendu le même jour.
		expect(window).toEqual({
			pickupDate: SAMEDI,
			returnDate: SAMEDI,
			durationDays: 1,
		});
	});

	it("garde samedi → lundi : seul le retour compte, pas le dimanche traversé", () => {
		const window = resolveCheckoutWindow({
			pickupDate: SAMEDI,
			requestedDuration: 3,
			durations: TOUTES_DUREES,
			settings: HORS_DIMANCHE,
		});
		expect(window?.returnDate).toBe(LUNDI);
		expect(window?.durationDays).toBe(3);
	});

	it("allonge plutôt que de raccourcir quand la durée demandée devient impossible", () => {
		// Retrait le vendredi + 3 jours : le retour tombe le dimanche, fermé. Le
		// retour ne doit pas glisser pour autant — seule la durée change, prolongée
		// jusqu'à la plus proche servie, soit 7 jours.
		const window = resolveCheckoutWindow({
			pickupDate: VENDREDI,
			requestedDuration: 3,
			durations: TOUTES_DUREES,
			settings: HORS_DIMANCHE,
		});
		expect(window).toEqual({
			pickupDate: VENDREDI,
			returnDate: "2026-04-16",
			durationDays: 7,
		});
	});

	it("laisse la fenêtre vide si aucune durée ne convient", () => {
		// La seule durée proposée depuis un samedi finit un dimanche fermé.
		const window = resolveCheckoutWindow({
			pickupDate: SAMEDI,
			requestedDuration: 2,
			durations: [2],
			settings: HORS_DIMANCHE,
		});
		expect(window).toBeNull();
	});

	it("accepte toute durée quand le dimanche est ouvert", () => {
		const window = resolveCheckoutWindow({
			pickupDate: VENDREDI,
			requestedDuration: 3,
			durations: TOUTES_DUREES,
			settings: TOUS_LES_JOURS,
		});
		expect(window?.durationDays).toBe(3);
		expect(window?.returnDate).toBe(DIMANCHE);
	});

	it("garde une date seule tant qu'aucune durée n'est choisie", () => {
		expect(
			resolveCheckoutWindow({
				pickupDate: SAMEDI,
				requestedDuration: null,
				durations: TOUTES_DUREES,
				settings: HORS_DIMANCHE,
			}),
		).toBeNull();
	});

	it("accepte la demande avant que les réglages arrivent", () => {
		const window = resolveCheckoutWindow({
			pickupDate: SAMEDI,
			requestedDuration: 3,
			durations: TOUTES_DUREES,
		});
		expect(window?.returnDate).toBe(LUNDI);
	});
});

describe("blockedCheckoutDurations", () => {
	it("ne bloque rien avant le choix d'une date de retrait", () => {
		expect(
			blockedCheckoutDurations({
				pickupDate: null,
				durations: TOUTES_DUREES,
				settings: HORS_DIMANCHE,
			}),
		).toEqual([]);
	});

	it("ne bloque rien tant que les réglages n'ont pas répondu", () => {
		expect(
			blockedCheckoutDurations({
				pickupDate: SAMEDI,
				durations: TOUTES_DUREES,
			}),
		).toEqual([]);
	});

	it("grise la durée dont le retour tombe un dimanche fermé", () => {
		const blocked = blockedCheckoutDurations({
			pickupDate: SAMEDI,
			durations: TOUTES_DUREES,
			settings: HORS_DIMANCHE,
		});
		// Samedi : +1 samedi, +2 dimanche (bloqué), +3 lundi, +7 samedi.
		expect(blocked.map((block) => block.duration)).toEqual([2]);
		expect(blocked[0]?.reason).toContain("dimanche 12 avril 2026");
	});

	it("ne bloque rien le dimanche si le magasin l'ouvre", () => {
		expect(
			blockedCheckoutDurations({
				pickupDate: SAMEDI,
				durations: TOUTES_DUREES,
				settings: TOUS_LES_JOURS,
			}),
		).toEqual([]);
	});

	it("bloque une durée que le matériel sélectionné ne vend pas", () => {
		const blocked = blockedCheckoutDurations({
			pickupDate: SAMEDI,
			durations: TOUTES_DUREES,
			settings: HORS_DIMANCHE,
			// Ce matériel ne vend que 1 et 7 jours.
			priceOptions: options(1, 7),
		});
		// 2 jours : retour fermé. 3 jours : retour possible mais non tarifé.
		expect(blocked.map((block) => block.duration)).toEqual([2, 3]);
		expect(blocked[1]?.reason).toBe("aucun tarif 3j pour ce matériel");
	});

	it("respecte la durée minimale de l'article", () => {
		const blocked = blockedCheckoutDurations({
			pickupDate: SAMEDI,
			durations: TOUTES_DUREES,
			settings: HORS_DIMANCHE,
			priceOptions: options(1, 2, 3, 7),
			minDuration: 2,
		});
		// 2 jours : retour fermé. 1 jour : sous le minimum de 2 jours de l'article,
		// donc refus tarifaire et non calendaire.
		expect(blocked.map((block) => block.duration)).toEqual([2, 1]);
		expect(blocked[1]?.reason).toBe("aucun tarif 1j pour ce matériel");
	});

	it("ne signale qu'une raison par durée, la fermeture primant", () => {
		const blocked = blockedCheckoutDurations({
			pickupDate: SAMEDI,
			durations: TOUTES_DUREES,
			settings: HORS_DIMANCHE,
			priceOptions: options(1, 3),
		});
		// 3 jours est bien vendu : seul 7 jours est refusé pour un motif tarifaire.
		const byDuration = new Map(blocked.map((b) => [b.duration, b.reason]));
		expect(byDuration.get(2)).toContain("magasin fermé");
		expect(byDuration.get(3)).toBeUndefined();
		expect(byDuration.get(7)).toBe("aucun tarif 7j pour ce matériel");
	});

	it("ignore une option de prix illisible, comme le serveur", () => {
		const blocked = blockedCheckoutDurations({
			pickupDate: SAMEDI,
			durations: TOUTES_DUREES,
			settings: HORS_DIMANCHE,
			priceOptions: [
				{ id: "opt-3", duration: 3, label: "3j", price: "n'importe quoi" },
			],
		});
		expect(blocked.map((block) => block.duration)).toContain(3);
	});
});
