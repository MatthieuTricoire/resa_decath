/**
 * Horaires d'ouverture du magasin : une ligne par jour, éditée depuis l'admin.
 *
 * Le type décrit ce que l'affichage et les calendriers consomment, pas ce que la
 * table contient. La table garde deux créneaux en colonnes ; ici ils sont déjà
 * réunis dans `slots`, ce qui évite à chaque lecteur de se demander si le
 * créneau du matin existe.
 *
 * `isOpen` est le seul juge : un jour fermé conserve ses `slots` (pour pouvoir
 * être rouvert sans ressaisie) mais n'en publie aucun. Aucun lecteur ne doit
 * donc déduire l'ouverture de la présence d'un créneau.
 *
 * Les jours sont toujours rendus dans l'ordre d'affichage, du lundi au dimanche,
 * dimanche fermé compris — c'est cet ordre que la page ville et le pied de page
 * consomment, et le tableau doit donc contenir ses sept lignes. Chaque entrée
 * porte son `day` (0 = dimanche), qui est la convention des calendriers : l'ordre
 * du tableau ne doit jamais servir à deviner le jour de la semaine.
 */

export type StoreDaySlot = {
	/** `HH:MM`. */
	opens: string;
	/** `HH:MM`, strictement après `opens`. */
	closes: string;
};

export type StoreDayHours = {
	/** 0 = dimanche … 6 = samedi. */
	day: number;
	/** Libellé capitalisé, conservé depuis la base pour un affichage stable. */
	label: string;
	isOpen: boolean;
	/** Créneaux dans l'ordre de la journée ; conservé même si le jour est fermé. */
	slots: StoreDaySlot[];
};

/** Les sept jours, du lundi au dimanche. */
export type StoreHours = StoreDayHours[];

/** Horaires du magasin, utilisés tant que la table est vide. */
const DEFAULT_DAY: Omit<StoreDayHours, "day" | "label"> = {
	isOpen: true,
	slots: [
		{ opens: "09:00", closes: "12:30" },
		{ opens: "14:30", closes: "19:00" },
	],
};

/**
 * Semaine de référence, également utilisée comme seed.
 *
 * Le dimanche porte ses horaires (8h45–13h) tout en restant fermé : le store est
 * fermé la moitié de l'année, et ouvrir un dimanche en forte saison ne doit
 * coûter qu'un interrupteur, pas une saisie d'horaires. Le tableau est donc la
 * seule source de vérité et la seule à exposer les deux informations.
 */
export const DEFAULT_STORE_HOURS: StoreHours = [
	{ day: 1, label: "Lundi", ...DEFAULT_DAY },
	{ day: 2, label: "Mardi", ...DEFAULT_DAY },
	{ day: 3, label: "Mercredi", ...DEFAULT_DAY },
	{ day: 4, label: "Jeudi", ...DEFAULT_DAY },
	{ day: 5, label: "Vendredi", ...DEFAULT_DAY },
	{ day: 6, label: "Samedi", ...DEFAULT_DAY },
	{
		day: 0,
		label: "Dimanche",
		isOpen: false,
		slots: [{ opens: "08:45", closes: "13:00" }],
	},
];

/** Libellés de repli, si la table ne contenait pas encore les sept jours. */
const DEFAULT_LABELS = [
	"Dimanche",
	"Lundi",
	"Mardi",
	"Mercredi",
	"Jeudi",
	"Vendredi",
	"Samedi",
];

export function defaultLabelForDay(day: number): string {
	return DEFAULT_LABELS[day] ?? `Jour ${day}`;
}

/**
 * Complète une lecture partielle pour toujours rendre sept lignes ordonnées du
 * lundi au dimanche : une base vide ne doit pas produire un tableau vide, sinon
 * le site afficherait un magasin sans horaires et le calendrier refuserait tout.
 *
 * Les créneaux d'un jour fermé sont **conservés**. Ce sont les horaires que
 * l'admin a saisis, pas ce qui est public : rouvrir un dimanche de forte
 * saison ne doit coûter qu'un interrupteur, pas ressaisir 8h45–13h. Ce qui est
 * publié est tranché à l'affichage (`storeOpeningHoursText`,
 * `getStoreOpeningHoursSpecification`), jamais ici.
 */
export function normalizeStoreHours(rows: StoreDayHours[]): StoreHours {
	const byDay = new Map(rows.map((row) => [row.day, row]));
	return [1, 2, 3, 4, 5, 6, 0].map((day) => {
		const row = byDay.get(day);
		if (row) return row;
		const fallback = DEFAULT_STORE_HOURS.find((entry) => entry.day === day);
		return (
			fallback ?? {
				day,
				label: defaultLabelForDay(day),
				isOpen: false,
				slots: [],
			}
		);
	});
}

/**
 * Les jours où un retrait ou un retour est possible, pour `isOpenDay`.
 *
 * Une journée fermée n'est pas une absence de données à contourner : si le
 * magasin est fermé toute la semaine, aucun jour n'est réservable et c'est ce que
 * la fonction doit dire.
 */
export function openDaysFromHours(hours: StoreHours): number[] {
	return hours.filter((day) => day.isOpen).map((day) => day.day);
}
