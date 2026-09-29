import {
	store,
	storeCanonicalPath,
	storeDefaultDescription,
	storeDefaultTitle,
} from "#/config/store";

/**
 * Helpers SEO partagés par les routes publiques : un seul endroit pour les
 * titres, descriptions, URLs canoniques et JSON-LD.
 */

export type PageMeta = {
	title: string;
	description: string;
	/** `null` pour une page qui ne doit pas être indexée. */
	canonicalPath: string | null;
	noIndex: boolean;
	image?: string | null;
	type?: "website" | "product";
};

/** Titre « Page – Boutique » sans doublon de préfixe. */
export function pageTitle(title: string): string {
	const suffix = ` – ${store.name}`;
	return title.endsWith(suffix) ? title : `${title}${suffix}`;
}

/**
 * Origine des URL absolues (canonical, og:url, JSON-LD).
 *
 * Côté serveur on renvoie `store.siteOrigin` et non l'hôte de la requête : un
 * canonical doit rester stable (et pointer la production) même derrière un
 * proxy ou en prévisualisation. Côté client on suit l'hôte courant, pratique
 * en dev. `src/lib/seo.ts` étant importé par les routes, il ne peut pas
 * importer `@tanstack/react-start/server` (protégé par `import-protection`
 * côté client).
 */
export function resolveOrigin(): string {
	if (typeof document !== "undefined") return window.location.origin;
	return store.siteOrigin;
}

export function absoluteUrl(path: string): string {
	return new URL(path, resolveOrigin()).toString();
}

/** Image par défaut des partages (logo), utilisé sur les pages sans photo. */
const DEFAULT_OG_IMAGE = "/logo512.png";

export function buildCanonicalUrl(path: string): string {
	return absoluteUrl(path);
}

type HeadOptions = {
	meta: PageMeta;
	jsonLd?: Array<Record<string, unknown>>;
	/**
	 * `false` pour une route qui sert aussi de parent : la route enfant émet
	 * alors son propre canonical (sinon la page expose deux canonicals).
	 */
	emitCanonical?: boolean;
};

/** Bloc `head()` des routes publiques : meta, canonical et JSON-LD. */
export function buildPageHead({
	meta,
	jsonLd = [],
	emitCanonical = true,
}: HeadOptions): {
	meta: Array<Record<string, string>>;
	links: Array<Record<string, string>>;
	scripts: Array<{ type: "application/ld+json"; children: string }>;
} {
	const canonical =
		emitCanonical && meta.canonicalPath
			? buildCanonicalUrl(meta.canonicalPath)
			: null;

	const metaTags: Array<Record<string, string>> = [
		{ title: pageTitle(meta.title) },
		{ name: "description", content: meta.description },
		{
			property: "og:site_name",
			content: store.name,
		},
		{
			property: "og:title",
			content: pageTitle(meta.title),
		},
		{ property: "og:description", content: meta.description },
		{ property: "og:type", content: meta.type ?? "website" },
		{ property: "og:locale", content: "fr_FR" },
		{ name: "twitter:card", content: "summary_large_image" },
		{
			name: "twitter:title",
			content: pageTitle(meta.title),
		},
		{ name: "twitter:description", content: meta.description },
	];

	if (canonical) {
		metaTags.push({ property: "og:url", content: canonical });
	}
	// Les images des partages (og + twitter) sortent par paire. Sur les pages
	// indexables sans photo propre (accueil avant le héro, activité…), on
	// renvoie le logo plutôt que rien : un lien partagé sans vignette paraît
	// cassé. Idéalement remplacer `logo512.png` par une image 1200×630.
	if (!meta.noIndex) {
		const image = meta.image ?? absoluteUrl(DEFAULT_OG_IMAGE);
		metaTags.push({ property: "og:image", content: image });
		metaTags.push({ name: "twitter:image", content: image });
	}
	if (meta.noIndex) {
		metaTags.push({ name: "robots", content: "noindex, nofollow" });
	} else if (!store.robots.index) {
		metaTags.push({ name: "robots", content: "noindex, nofollow" });
	}

	const links = canonical ? [{ rel: "canonical", href: canonical }] : [];

	return {
		meta: metaTags,
		links,
		scripts: jsonLd.map((data) => ({
			type: "application/ld+json",
			children: JSON.stringify(data),
		})),
	};
}

/** JSON-LD `Store` : nom, adresse, téléphone, horaires, URL. */
export function storeJsonLd(openingHours: unknown[]): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "SportsActivityLocation",
		"@id": `${absoluteUrl(storeCanonicalPath)}#store`,
		name: store.name,
		description: storeDefaultDescription,
		url: absoluteUrl(storeCanonicalPath),
		image: absoluteUrl("/logo512.png"),
		telephone: store.phone,
		address: {
			"@type": "PostalAddress",
			streetAddress: store.address,
			addressLocality: store.city,
			postalCode: store.postalCode,
			addressCountry: "FR",
		},
		// Les coordonnées de Laruns ancrent le magasin sur la carte (résultats
		// locaux). `sameAs` liste les profils sociaux du magasin : remplir ici
		// quand les pages Facebook/Instagram existent.
		geo: {
			"@type": "GeoCoordinates",
			latitude: 42.8725,
			longitude: -0.4267,
		},
		areaServed: "Vallée d'Ossau et Pays Oloronais",
		sameAs: [],
		openingHoursSpecification: openingHours,
		paymentAccepted: "Espèces, Carte bancaire",
		currenciesAccepted: "EUR",
	};
}

/** JSON-LD `BreadcrumbList` pour les pages internes. */
export function breadcrumbJsonLd(
	trail: Array<{ name: string; path: string }>,
): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: trail.map((crumb, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: crumb.name,
			item: absoluteUrl(crumb.path),
		})),
	};
}

/** JSON-LD `ItemList` : le catalogue d'une activité. */
export function itemListJsonLd(
	activityName: string,
	path: string,
	items: Array<{ name: string; path: string }>,
): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "ItemList",
		name: `Matériel ${activityName} à louer à Laruns`,
		url: absoluteUrl(path),
		numberOfItems: items.length,
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			url: absoluteUrl(item.path),
		})),
	};
}

type ProductLdInput = {
	name: string;
	path: string;
	category: string;
	description: string | null;
	brand: string;
	image?: string | null;
	/** « 6.50 » — le tarif d'entrée (1ᵉʳ jour) ou `null` si aucun prix. */
	priceFrom: string | null;
	bookable: boolean;
};

/** JSON-LD `Product` + `Offer` : la fiche du matériel de location. */
export function productJsonLd(input: ProductLdInput): Record<string, unknown> {
	const offer = input.priceFrom
		? {
				"@type": "Offer",
				url: absoluteUrl(input.path),
				price: input.priceFrom,
				priceCurrency: "EUR",
				availability: input.bookable
					? "https://schema.org/InStock"
					: "https://schema.org/OutOfStock",
			}
		: undefined;
	return {
		"@context": "https://schema.org",
		"@type": "Product",
		name: `${input.name} — location à Laruns`,
		description:
			input.description ??
			`${input.name} ${input.brand} à la location à ${store.name} ${store.city}.`,
		url: absoluteUrl(input.path),
		image: input.image ?? undefined,
		brand: {
			"@type": "Brand",
			name: input.brand,
		},
		category: `Location ${input.category}`,
		offers: offer,
	};
}

export type FaqEntry = { question: string; answer: string };

/** JSON-LD `FAQPage` : les questions fréquentes, exploitées par Google. */
export function faqPageJsonLd(faq: FaqEntry[]): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faq.map(({ question, answer }) => ({
			"@type": "Question",
			name: question,
			acceptedAnswer: {
				"@type": "Answer",
				text: answer,
			},
		})),
	};
}

export const homeMeta: PageMeta = {
	title: storeDefaultTitle,
	description: storeDefaultDescription,
	canonicalPath: storeCanonicalPath,
	noIndex: false,
};
