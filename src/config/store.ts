/**
 * Données du magasin : une source unique pour le header, le footer, les pages
 * NAP, le JSON-LD `Store` et le pied des emails transactionnels.
 *
 * Les **horaires d'ouverture** ne sont pas ici : ils sont la seule chose que
 * l'admin pilote au quotidien, et les garder dans une constante aurait garanti
 * que le footer, la page ville et le JSON-LD finissent par afficher trois
 * versions d'horaires différentes. Ils vivent dans `store_hours` et sont lus par
 * `features/store-hours`, dont les fonctions d'affichage vivent ci-dessous pour
 * rester utilisables aussi bien dans un composant que dans une fonction de SEO.
 */

import type { StoreHours } from "#/features/store-hours/types";

export const store = {
	name: "Décathlon Mountain",
	city: "Laruns",
	citySlug: "laruns",
	postalCode: "64440",
	address: "9046 Rue d'Aiga Bera",
	fullAddress: "9046 Rue d'Aiga Bera, 64440 Laruns",
	phone: "05 54 20 01 40",
	/** Format E.164, requis pour `tel:` et schema.org */
	phoneHref: "tel:+33554200140",
	/** Retrait possible dès l'ouverture, retour avant la fermeture. */
	pickupWindow: "dès l’ouverture",
	returnWindow: "avant la fermeture",
	paymentNotice: "Paiement et retrait en magasin, au comptoir location.",
	defaultTitle: "Location de matériel de montagne à Laruns",
	defaultDescription:
		"Réservez en ligne votre matériel de montagne à Décathlon Mountain Laruns : escalade, randonnée, bivouac et via ferrata. Retrait et paiement en magasin.",
	robots: { index: true, follow: true },
	/** Origine publique servie par le SEO (canonical, JSON-LD, partages). */
	siteOrigin: "https://www.decathlon-mountain-laruns.fr",
} as const;

export const storeCanonicalPath = `/location-materiel-${store.citySlug}`;

export const storeDefaultTitle = store.defaultTitle;
export const storeDefaultDescription = store.defaultDescription;

/**
 * Jours ouverts au format schema.org.
 *
 * Un jour donne autant d'entrées qu'il a de créneaux : c'est la seule façon
 * correcte de publier une fermeture de midi, l'ancienne version n'en annonçait
 * qu'un seul par jour et laissait donc la pause de déjeuner invisible. Un jour
 * fermé n'en produit aucune — même s'il porte des horaires en base, qui ne servent
 * qu'à le rouvrir vite — ce qui laisse Google lire une fermeture plutôt qu'une
 * journée à horaires indéterminés.
 */
export function getStoreOpeningHoursSpecification(hours: StoreHours): Array<{
	"@type": "openingHoursSpecification";
	dayOfWeek: string;
	opens: string;
	closes: string;
}> {
	const days = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];

	return hours.flatMap((day) =>
		day.isOpen
			? day.slots.map((slot) => ({
					"@type": "openingHoursSpecification" as const,
					dayOfWeek: `https://schema.org/${days[day.day]}`,
					opens: slot.opens,
					closes: slot.closes,
				}))
			: [],
	);
}

/**
 * Les horaires prêts à afficher, un jour par ligne.
 *
 * Les jours fermés sont conservés avec le mot « fermé » plutôt que retirés : un
 * tableau qui saute le dimanche laisse croire que l'info a été oubliée, alors
 * qu'elle est la première chose qu'un client veut vérifier avant de venir.
 */
export function storeOpeningHoursText(hours: StoreHours): Array<{
	day: string;
	hours: string;
}> {
	return hours.map((day) => ({
		day: day.label,
		hours: storeDayHoursText(day),
	}));
}

/** Un jour rendu en une chaîne : ses créneaux, ou « fermé ». */
function storeDayHoursText(day: StoreHours[number]): string {
	if (!day.isOpen) return "fermé";
	return day.slots.map((slot) => `${slot.opens} – ${slot.closes}`).join(" · ");
}

/**
 * Une plage de jours partageant les mêmes horaires, pour le pied de page.
 *
 * Sept lignes pour deux informations distinctes : le pied de page est une
 * colonne d'environ 250px, la page ville a toute la largeur dont elle veut. Les
 * jours y sont donc regroupés par créneaux identiques, ce qui ramène la semaine
 * de référence à deux lignes. `storeOpeningHoursText` garde le détail jour par
 * jour pour la page ville.
 *
 * Le regroupement est **calculé**, jamais figé en dur : si l'admin ferme le
 * samedi, la ligne devient « Lundi – Vendredi » puis « Samedi – Dimanche ». Une
 * plage écrite dans le code afficherait des horaires que l'admin a supprimés.
 *
 * Les groupes suivent l'ordre du calendrier, jamais l'ordre alphabétique :
 * « Samedi – Dimanche fermé » se lit sans avoir à compter les jours.
 */
export function storeOpeningHoursGrouped(hours: StoreHours): Array<{
	days: string;
	hours: string;
}> {
	const groups: Array<{ signature: string; hours: string; labels: string[] }> =
		[];

	for (const day of hours) {
		const text = storeDayHoursText(day);
		// `isOpen` entre dans la signature : deux jours sans créneau ne doivent
		// pas se retrouver dans le même groupe que deux jours ouverts.
		const signature = `${day.isOpen ? "open" : "closed"}:${text}`;
		const current = groups[groups.length - 1];
		if (current && current.signature === signature) {
			current.labels.push(day.label);
		} else {
			groups.push({ signature, hours: text, labels: [day.label] });
		}
	}

	return groups.map((group) => ({
		days: storeDayRangeLabel(group.labels),
		hours: group.hours,
	}));
}

/**
 * « Lundi », « Lundi – Mercredi », « Tous les jours ».
 *
 * Les sept jours ensemble ne sont pas nommés jusqu'au bout : « Tous les jours »
 * est plus court et sans ambiguïté, là où « Lundi – Dimanche » se lit comme une
 * plage alors qu'elle couvre toute la semaine.
 */
function storeDayRangeLabel(labels: string[]): string {
	if (labels.length === 7) return "Tous les jours";
	if (labels.length === 1) return labels[0] ?? "";
	return `${labels[0]} – ${labels[labels.length - 1]}`;
}
