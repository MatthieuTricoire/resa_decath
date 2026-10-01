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
		hours: day.isOpen
			? day.slots.map((slot) => `${slot.opens} – ${slot.closes}`).join(" · ")
			: "fermé",
	}));
}
