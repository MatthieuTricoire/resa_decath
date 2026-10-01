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

	it("ramène la semaine de référence à une seule ligne", () => {
		// Le jour fermé disparaît : c'est la page ville qui porte le détail avec
		// « fermé », pas le footer.
		expect(storeOpeningHoursGrouped(semaine())).toEqual([
			{ days: "Lundi – Samedi", hours: "09:00 – 12:30 · 14:30 – 19:00" },
		]);
	});

	it("ne publie aucun jour fermé", () => {
		for (const hours of storeOpeningHoursGrouped(
			semaine({ 3: { isOpen: false } }),
		)) {
			expect(hours.hours).not.toBe("fermé");
			expect(hours.days).not.toContain("Mercredi");
		}
	});

	it("ignore les horaires conservés d'un jour fermé", () => {
		// Le dimanche porte 8h45–13h en base : tant qu'il est fermé, ces horaires
		// ne doivent rien laisser dans le footer.
		const dimancheFerme = semaine({
			0: { isOpen: false, slots: [{ opens: "08:45", closes: "13:00" }] },
		});
		expect(storeOpeningHoursGrouped(dimancheFerme)).toEqual([
			{ days: "Lundi – Samedi", hours: "09:00 – 12:30 · 14:30 – 19:00" },
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

	it("n'écrit « Tous les jours » que si les 7 jours sont ouverts", () => {
		// Six jours ouverts suffisent à retirer le libellé : il dirait une semaine
		// ouverte en semaine.
		const sixOuverts = semaine({ 6: { isOpen: false, slots: [] } });
		expect(storeOpeningHoursGrouped(sixOuverts).map((g) => g.days)).toEqual([
			"Lundi – Vendredi",
		]);
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
		]);
	});

	it("separe les deux plages d'un jour fermé au milieu", () => {
		// Fermer le mercredi laisse « Lundi – Mardi » puis « Jeudi – samedi ». Le
		// trou se devine mais ne s'explique pas : c'est le prix assumé d'un footer
		// de deux lignes, et le détail reste sur la page ville.
		const mercrediFerme = semaine({ 3: { isOpen: false, slots: [] } });
		expect(storeOpeningHoursGrouped(mercrediFerme).map((g) => g.days)).toEqual([
			"Lundi – Mardi",
			"Jeudi – Samedi",
		]);
	});

	it("ne fait jamais couvrir un jour fermé par une plage", () => {
		// Le piege : en ignorant les jours fermes, le mercredi glissait dans la
		// plage « Lundi – Samedi » et le footer affirmait l'ouverture d'un jour
		// ferme. Chaque jour ferme doit couper le groupe qui le precede.
		for (const ferme of [0, 1, 2, 3, 4, 5, 6]) {
			const jours = semaine({ [ferme]: { isOpen: false, slots: [] } });
			const groupes = storeOpeningHoursGrouped(jours);
			const labelFerme = jours.find((day) => day.day === ferme)?.label;

			// Une plage ne peut pas declarer 7 jours alors qu'un est ferme.
			expect(groupes.every((group) => group.days !== "Tous les jours")).toBe(
				true,
			);

			// Le libelle du jour ferme ne doit pas figurer comme borne d'une plage.
			for (const group of groupes) {
				const bornes = group.days.split(" – ");
				expect(bornes).not.toContain(labelFerme ?? "?");
			}
		}
	});

	it("rend une liste vide quand la semaine entière est fermée", () => {
		// Le footer traite ce cas à part avec « Fermé toute la semaine » : sans cela
		// le bloc disparaîtrait et laisserait croire à une absence d'horaires.
		const toutFerme = semaine(
			Object.fromEntries(
				[0, 1, 2, 3, 4, 5, 6].map((day) => [day, { isOpen: false, slots: [] }]),
			),
		);
		expect(storeOpeningHoursGrouped(toutFerme)).toEqual([]);
	});

	it("ne peut pas changer les horaires d'un jour ouvert", () => {
		// Le regroupement redecoupe la semaine, il ne la redecrit pas : les horaires
		// doivent être exactement ceux que le detail donne pour ces mêmes jours.
		const jours = semaine();
		const detail = storeOpeningHoursText(jours);
		const groupes = storeOpeningHoursGrouped(jours);

		// Chaque horaire du footer existe tel quel dans le detail quotidien.
		const parDetail = new Set(detail.map((day) => day.hours));
		for (const group of groupes) {
			expect(parDetail.has(group.hours)).toBe(true);
		}

		// Et le detail des jours fermes ne se retrouve dans aucun groupe.
		for (const day of jours.filter((entry) => !entry.isOpen)) {
			const attendu = storeOpeningHoursText([day])[0]?.hours;
			expect(groupes.map((group) => group.hours)).not.toContain(attendu);
		}
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
