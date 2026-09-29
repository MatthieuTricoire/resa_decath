import { describe, expect, it } from "vitest";
import { makeUniqueSlug, slugify, slugifyOrFallback } from "./slug";

describe("slugify", () => {
	it("retire les accents et met en minuscules", () => {
		expect(slugify("Sac à dos Simond MH500")).toBe("sac-a-dos-simond-mh500");
		expect(slugify("Crampons Cascade Électriques")).toBe(
			"crampons-cascade-electriques",
		);
	});

	it("réduit les séparateurs et supprime ceux en bord", () => {
		expect(slugify("  ---  Kit  --  Ski   ")).toBe("kit-ski");
		expect(slugify("téléski / descente")).toBe("teleski-descente");
	});

	it("ignore la casse et les caractères non latins", () => {
		expect(slugify("TELESKI 100% ⛷")).toBe("teleski-100");
	});

	it("renvoie une chaîne vide si rien ne reste", () => {
		expect(slugify("★★★")).toBe("");
	});
});

describe("slugifyOrFallback", () => {
	it("utilise le libellé quand il produit un slug", () => {
		expect(slugifyOrFallback("Sac à dos", "produit")).toBe("sac-a-dos");
	});

	it("retombe sur le fallback si le libellé est vide", () => {
		expect(slugifyOrFallback("★★", "MonProduit")).toBe("monproduit");
	});
});

describe("makeUniqueSlug", () => {
	it("conserve le slug s'il est libre", async () => {
		const isTaken = async () => false;
		expect(await makeUniqueSlug("Sac à dos", isTaken)).toBe("sac-a-dos");
	});

	it("ajoute un suffixe numérique si le slug est déjà pris", async () => {
		const taken = new Set(["sac-a-dos", "sac-a-dos-2"]);
		const isTaken = async (slug: string) => taken.has(slug);
		expect(await makeUniqueSlug("Sac à dos", isTaken)).toBe("sac-a-dos-3");
	});

	it("retombe sur « produit » quand le libellé est vide", async () => {
		const isTaken = async () => false;
		expect(await makeUniqueSlug("***", isTaken)).toBe("produit");
	});
});
