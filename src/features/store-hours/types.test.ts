import { describe, expect, it } from "vitest";
import { storeOpeningHoursText } from "#/config/store";
import {
	DEFAULT_STORE_HOURS,
	defaultLabelForDay,
	normalizeStoreHours,
	openDaysFromHours,
	type StoreDayHours,
} from "./types";

const lundi = (hours: Partial<StoreDayHours> = {}): StoreDayHours => ({
	day: 1,
	label: "Lundi",
	isOpen: true,
	slots: [{ opens: "09:00", closes: "12:30" }],
	...hours,
});

describe("normalizeStoreHours", () => {
	it("rend sept lignes ordonnées du lundi au dimanche", () => {
		const hours = normalizeStoreHours([lundi()]);

		expect(hours).toHaveLength(7);
		expect(hours.map((day) => day.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
	});

	it("complète une base vide avec la semaine de référence plutôt que de laisser des jours sans horaires", () => {
		const hours = normalizeStoreHours([]);

		expect(hours).toEqual(DEFAULT_STORE_HOURS);
		// Un calendrier qui refuserait tout faute de données casserait la boutique.
		expect(openDaysFromHours(hours)).toContain(1);
	});

	it("conserve l'ordre demandé en base plutôt que l'ordre du tableau reçu", () => {
		const hours = normalizeStoreHours([
			{ day: 0, label: "Dimanche", isOpen: false, slots: [] },
			lundi(),
		]);

		expect(hours.map((day) => day.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
	});

	it("ignore une ligne de jour inconnu plutôt que de fausser le compte des sept jours", () => {
		const hours = normalizeStoreHours([
			lundi(),
			{ day: 9, label: "Inconnu", isOpen: true, slots: [] },
		]);

		expect(hours).toHaveLength(7);
		expect(hours.some((day) => day.day === 9)).toBe(false);
	});

	it("conserve les créneaux d'un jour fermé pour les rouvrir sans ressaisie", () => {
		const dimanche = {
			day: 0,
			label: "Dimanche",
			isOpen: false,
			slots: [{ opens: "08:45", closes: "13:00" }],
		};
		const hours = normalizeStoreHours([dimanche]);
		const stored = hours.find((day) => day.day === 0);

		expect(stored?.isOpen).toBe(false);
		expect(stored?.slots).toEqual([{ opens: "08:45", closes: "13:00" }]);
		// Le jour reste fermé malgré des horaires présents : isOpen tranche seul.
		expect(openDaysFromHours(hours)).not.toContain(0);
	});
});

describe("openDaysFromHours", () => {
	it("ne retient que les jours ouverts", () => {
		expect(
			openDaysFromHours(
				normalizeStoreHours([
					lundi(),
					{ day: 2, label: "Mardi", isOpen: false, slots: [] },
				]),
			),
		).toEqual([1, 3, 4, 5, 6]);
	});

	it("reste vide quand le magasin est fermé toute la semaine", () => {
		const ferme = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
			day,
			label: defaultLabelForDay(day),
			isOpen: false,
			slots: [],
		}));

		expect(openDaysFromHours(ferme)).toEqual([]);
	});
});

describe("publication des horaires", () => {
	const texte = (day: number) =>
		storeOpeningHoursText(normalizeStoreHours([])).find(
			(entry) => entry.day === defaultLabelForDay(day),
		)?.hours;

	it("publie les deux créneaux d'un jour ouvert", () => {
		expect(texte(1)).toBe("09:00 – 12:30 · 14:30 – 19:00");
	});

	it("ne publie rien pour un jour fermé qui porte pourtant des horaires en base", () => {
		// Le dimanche porte 8h45–13h en base : seul isOpen décide de l'afficher.
		expect(texte(0)).toBe("fermé");
	});

	it("garde l'ordre d'affichage du lundi au dimanche", () => {
		expect(
			storeOpeningHoursText(normalizeStoreHours([])).map((entry) => entry.day),
		).toEqual([
			"Lundi",
			"Mardi",
			"Mercredi",
			"Jeudi",
			"Vendredi",
			"Samedi",
			"Dimanche",
		]);
	});
});
