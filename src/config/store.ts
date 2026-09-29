/**
 * Données du magasin : une source unique pour le header, le footer, les pages
 * NAP, le JSON-LD `Store` et le pied des emails transactionnels.
 *
 * Seul le dimanche a une ouverture variable : elle vient des réglages en base
 * et se lit via `getRentalSettingsRecord`. Les fonctions d'affichage la
 * reçoivent donc en paramètre plutôt que de la lire ici, ce qui les garde
 * utilisables aussi bien dans un composant que dans une fonction de SEO.
 */

export type StoreOpeningHour = {
	/** 0 = dimanche … 6 = samedi */
	day: number;
	label: string;
	opens: string;
	closes: string;
};

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
	pickupWindow: "dès l’ouverture (9h)",
	returnWindow: "avant la fermeture (19h)",
	paymentNotice: "Paiement et retrait en magasin, au comptoir location.",
	openingHours: [
		{ day: 1, label: "Lundi", opens: "09:00", closes: "19:00" },
		{ day: 2, label: "Mardi", opens: "09:00", closes: "19:00" },
		{ day: 3, label: "Mercredi", opens: "09:00", closes: "19:00" },
		{ day: 4, label: "Jeudi", opens: "09:00", closes: "19:00" },
		{ day: 5, label: "Vendredi", opens: "09:00", closes: "19:00" },
		{ day: 6, label: "Samedi", opens: "09:00", closes: "19:00" },
		{ day: 0, label: "Dimanche", opens: "", closes: "" },
	] satisfies StoreOpeningHour[],
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

/** Horaires d'un jour d'ouverture : 09h–19h comme les six autres jours. */
const DEFAULT_OPENING_HOUR = { opens: "09:00", closes: "19:00" } as const;

/**
 * Horaires réels, le dimanche étant la seule ouverture variable : elle se règle
 * depuis l'admin (forte saison) et ne peut donc pas rester figée dans la config.
 * Les horaires de tous les autres jours sont eux constants.
 */
export function storeOpeningHours(sundayOpen: boolean): StoreOpeningHour[] {
	return store.openingHours.map((hour) =>
		hour.day === 0 && sundayOpen ? { ...hour, ...DEFAULT_OPENING_HOUR } : hour,
	);
}

/** Horaires au format schema.org (aucune entrée pour le jour de fermeture). */
export function getStoreOpeningHoursSpecification(sundayOpen: boolean): Array<{
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

	return storeOpeningHours(sundayOpen)
		.filter((hour) => hour.opens && hour.closes)
		.map((hour) => ({
			"@type": "openingHoursSpecification" as const,
			dayOfWeek: `https://schema.org/${days[hour.day]}`,
			opens: hour.opens,
			closes: hour.closes,
		}));
}

/** « Lundi 09:00 – 19:00 · … · Dimanche 09:00 – 19:00 » pour le pied de page. */
export function storeOpeningHoursText(sundayOpen: boolean): string {
	return storeOpeningHours(sundayOpen)
		.filter((hour) => hour.opens && hour.closes)
		.map((hour) => `${hour.label} ${hour.opens} – ${hour.closes}`)
		.join(" · ");
}
