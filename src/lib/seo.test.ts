import { describe, expect, it } from "vitest";
import {
	getStoreOpeningHoursSpecification,
	store,
	storeCanonicalPath,
} from "#/config/store";
import {
	absoluteUrl,
	breadcrumbJsonLd,
	buildPageHead,
	faqPageJsonLd,
	itemListJsonLd,
	pageTitle,
	productJsonLd,
	storeJsonLd,
} from "./seo";

describe("pageTitle", () => {
	it("ajoute le suffixe de boutique", () => {
		expect(pageTitle("Location de vélos")).toBe(
			"Location de vélos – Décathlon Mountain",
		);
	});

	it("ne duplique pas le suffixe", () => {
		expect(pageTitle("Vélos – Décathlon Mountain")).toBe(
			"Vélos – Décathlon Mountain",
		);
	});
});

describe("absoluteUrl", () => {
	it("s'appuie sur l'origine de la boutique en environnement serveur", () => {
		expect(absoluteUrl("/activite/bivouac")).toBe(
			"https://www.decathlon-mountain-laruns.fr/activite/bivouac",
		);
	});
});

describe("buildPageHead", () => {
	const indexableMeta = {
		title: "Matériel d'escalade",
		description: "La falaise vous attend.",
		canonicalPath: "/activite/escalade-bloc",
		noIndex: false,
	} satisfies Parameters<typeof buildPageHead>[0]["meta"];

	it("émet og:image et twitter:image par paire avec le logo par défaut", () => {
		const head = buildPageHead({ meta: indexableMeta });
		const ogImage = head.meta.find((tag) => tag.property === "og:image");
		const twitterImage = head.meta.find((tag) => tag.name === "twitter:image");
		expect(ogImage?.content).toBe(absoluteUrl("/logo512.png"));
		expect(twitterImage?.content).toBe(absoluteUrl("/logo512.png"));
	});

	it("émet l'image fournie sans jamais omettre la paire twitter", () => {
		const head = buildPageHead({
			meta: { ...indexableMeta, image: absoluteUrl("/hero-escalade.jpg") },
		});
		const ogImage = head.meta.find((tag) => tag.property === "og:image");
		const twitterImage = head.meta.find((tag) => tag.name === "twitter:image");
		expect(ogImage?.content).toBe(absoluteUrl("/hero-escalade.jpg"));
		expect(twitterImage?.content).toBe(absoluteUrl("/hero-escalade.jpg"));
	});

	it("expédie un noindex total sans image de partage", () => {
		const head = buildPageHead({
			meta: {
				title: "Mon compte",
				description: "Privé",
				canonicalPath: null,
				noIndex: true,
			},
		});
		expect(head.meta.some((tag) => tag.name === "robots")).toBe(true);
		expect(head.meta.some((tag) => tag.property === "og:image")).toBe(false);
		expect(head.links).toHaveLength(0);
	});

	it("décline l'URL canonique en og:url", () => {
		const head = buildPageHead({ meta: indexableMeta });
		const ogUrl = head.meta.find((tag) => tag.property === "og:url");
		expect(ogUrl?.content).toBe(absoluteUrl("/activite/escalade-bloc"));
		expect(head.links[0]).toEqual({
			rel: "canonical",
			href: absoluteUrl("/activite/escalade-bloc"),
		});
	});
});

describe("storeJsonLd", () => {
	it("ancre le magasin localement avec geo, areaServed et image", () => {
		const ld = storeJsonLd([]) as {
			geo: { latitude: number; longitude: number };
			areaServed: string;
			image: string;
			sameAs: string[];
		};
		expect(ld.geo.latitude).toBeGreaterThan(42);
		expect(ld.geo.longitude).toBeLessThan(0);
		expect(ld.areaServed).toContain("Ossau");
		expect(ld.image).toBe(absoluteUrl("/logo512.png"));
		expect(ld.sameAs).toEqual([]);
	});

	it("n'annonce que les jours réellement ouverts", () => {
		// Horaires sans ouverture dominicale : six jours, pas de dimanche.
		const specification = storeJsonLd(getStoreOpeningHoursSpecification(false))
			.openingHoursSpecification as Array<{ dayOfWeek: string }>;
		expect(
			specification.some((hour) => hour.dayOfWeek.includes("Sunday")),
		).toBe(false);
		expect(specification.length).toBe(6);
	});
});

describe("itemListJsonLd", () => {
	const ld = itemListJsonLd("Escalade", "/activite/escalade-bloc", [
		{ name: "Baudrier", path: "/activite/escalade-bloc/baudrier" },
		{ name: "Casque", path: "/activite/escalade-bloc/casque" },
	]);

	it("numérote les listes et renvoie des URLs absolues", () => {
		const items = ld.itemListElement as Array<{
			position: number;
			url: string;
			name: string;
		}>;
		expect(ld.numberOfItems).toBe(2);
		expect(items[0]).toEqual({
			"@type": "ListItem",
			position: 1,
			name: "Baudrier",
			url: absoluteUrl("/activite/escalade-bloc/baudrier"),
		});
		expect(items[1].position).toBe(2);
	});
});

describe("productJsonLd", () => {
	const base = {
		name: "Baudrier Simond Edge",
		path: "/activite/escalade-bloc/baudrier-simond-edge",
		category: "Escalade bloc",
		description: null,
		brand: "Simond",
		priceFrom: "6.50",
		bookable: true,
	};

	it("embarque une offre si un prix existe", () => {
		const ld = productJsonLd(base) as {
			offers: { price: string; priceCurrency: string; availability: string };
		};
		expect(ld.offers).toBeDefined();
		expect(ld.offers.price).toBe("6.50");
		expect(ld.offers.priceCurrency).toBe("EUR");
		expect(ld.offers.availability).toBe("https://schema.org/InStock");
	});

	it("sans prix, aucun objet offre ne s'affiche", () => {
		const ld = productJsonLd({ ...base, priceFrom: null, bookable: false });
		expect(ld.offers).toBeUndefined();
	});

	it("indique le statut de disponibilité hors stock", () => {
		const ld = productJsonLd({ ...base, bookable: false }) as {
			offers: { availability: string };
		};
		expect(ld.offers.availability).toBe("https://schema.org/OutOfStock");
	});
});

describe("breadcrumbJsonLd", () => {
	it("expose un fil d'Ariane ordonné et absolu", () => {
		const ld = breadcrumbJsonLd([
			{ name: store.name, path: storeCanonicalPath },
			{ name: "Bivouac", path: "/activite/bivouac" },
		]) as { itemListElement: Array<{ position: number; item: string }> };
		expect(ld.itemListElement).toHaveLength(2);
		expect(ld.itemListElement[0].position).toBe(1);
		expect(ld.itemListElement[1].item).toBe(absoluteUrl("/activite/bivouac"));
	});
});

describe("faqPageJsonLd", () => {
	it("déclare chaque question et sa réponse", () => {
		const ld = faqPageJsonLd([
			{ question: "Où retire-t-on le matériel ?", answer: "Au comptoir." },
		]) as {
			mainEntity: Array<{
				name: string;
				acceptedAnswer: { text: string };
			}>;
		};
		expect(ld.mainEntity[0].name).toBe("Où retire-t-on le matériel ?");
		expect(ld.mainEntity[0].acceptedAnswer.text).toBe("Au comptoir.");
	});
});
