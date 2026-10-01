import { describe, expect, it } from "vitest";
import {
	storeOpeningHoursGrouped,
	storeOpeningHoursText,
} from "#/config/store";
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

describe("regroupement des horaires pour le pied de page", () => {
	/** Reprend la semaine de référence en modifiant les jours demandés. */
	const semaine = (
		overrides: Partial<Record<number, Partial<StoreDayHours>>> = {},
	) =>
		normalizeStoreHours([]).map((day) => ({
			...day,
			slots: day.isOpen
				? [
						{ opens: "09:00", closes: "12:30" },
						{ opens: "14:30", closes: "19:00" },
					]
				: [],
			...overrides[day.day],
		}));

	it("ramène la semaine de référence à deux lignes", () => {
		expect(storeOpeningHoursGrouped(semaine())).toEqual([
			{ days: "Lundi – Samedi", hours: "09:00 – 12:30 · 14:30 – 19:00" },
			{ days: "Dimanche", hours: "fermé" },
		]);
	});

	it("nomme « Tous les jours » quand l'admin ouvre les 7 jours", () => {
		const tousOuverts = semaine({
			0: {
				isOpen: true,
				slots: [
					{ opens: "09:00", closes: "12:30" },
					{ opens: "14:30", closes: "19:00" },
				],
			},
		});
		expect(storeOpeningHoursGrouped(tousOuverts)).toEqual([
			{ days: "Tous les jours", hours: "09:00 – 12:30 · 14:30 – 19:00" },
		]);
	});

	it("n'écrit « Tous les jours » que si les 7 jours vraiment identiques", () => {
		// Six jours ouverts et un fermé : la semaine n'est pas uniforme, le libellé
		// serait un mensonge.
		const sixOuverts = semaine({ 6: { isOpen: false, slots: [] } });
		const labels = storeOpeningHoursGrouped(sixOuverts).map((g) => g.days);
		expect(labels).not.toContain("Tous les jours");
		expect(labels).toEqual(["Lundi – Vendredi", "Samedi – Dimanche"]);
	});

	it("respecte l'ordre du calendrier quand un jour diffère au milieu", () => {
		// Regrouper par horaires sans suivre l'ordre donnerait « Mercredi » avant
		// « Lundi – Mardi » : la lecture serait fausse.
		const decale = semaine({
			3: { slots: [{ opens: "10:00", closes: "13:00" }] },
		});
		expect(storeOpeningHoursGrouped(decale)).toEqual([
			{ days: "Lundi – Mardi", hours: "09:00 – 12:30 · 14:30 – 19:00" },
			{ days: "Mercredi", hours: "10:00 – 13:00" },
			{ days: "Jeudi – Samedi", hours: "09:00 – 12:30 · 14:30 – 19:00" },
			{ days: "Dimanche", hours: "fermé" },
		]);
	});

	it("distingue un jour fermé de ses horaires conservés", () => {
		// Le dimanche garde 8h45–13h en base : il ne doit pas rejoindre le groupe
		// d'un jour ouvert qui ouvrirait à la même heure.
		const dimancheOuvert = semaine({
			0: { isOpen: true, slots: [{ opens: "08:45", closes: "13:00" }] },
		});
		const groups = storeOpeningHoursGrouped(dimancheOuvert);
		expect(groups).toEqual([
			{ days: "Lundi – Samedi", hours: "09:00 – 12:30 · 14:30 – 19:00" },
			{ days: "Dimanche", hours: "08:45 – 13:00" },
		]);
	});

	it("regroupe des jours fermés entre eux", () => {
		const toutFerme = semaine(
			Object.fromEntries(
				[0, 1, 2, 3, 4, 5, 6].map((day) => [day, { isOpen: false, slots: [] }]),
			),
		);
		// « Tous les jours · fermé » dit que le magasin existe et n'ouvre pas ;
		// un « fermé » nu se lirait comme une information manquante.
		expect(storeOpeningHoursGrouped(toutFerme)).toEqual([
			{ days: "Tous les jours", hours: "fermé" },
		]);
	});

	it("ne peut pas changer les horaires d'un jour", () => {
		// Le regroupement redecoupe la semaine, il ne la redecrit pas. On verifie
		// donc que l'ensemble des horaires publies est le meme dans les deux
		// rendus : le footer ne peut pas dire autre chose que la page ville.
		const detail = storeOpeningHoursText(semaine());
		const groupes = storeOpeningHoursGrouped(semaine());

		expect(new Set(groupes.map((group) => group.hours))).toEqual(
			new Set(detail.map((day) => day.hours)),
		);
	});

	it("nomme les deux extremites d'une plage, pas les jours du milieu", () => {
		// Une plage ne peut pas nommer ses sept jours : « Lundi – Samedi » doit se
		// lire comme une plage, sinon le footer reprend les sept lignes qu'on voulait
		// supprimer.
		const [premier] = storeOpeningHoursGrouped(semaine());
		expect(premier?.days).toBe("Lundi – Samedi");
		expect(premier?.days).not.toContain("Mercredi");
	});
});
