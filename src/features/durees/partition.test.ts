import { describe, expect, it } from "vitest";
import { partitionPriceOptions } from "#/features/durees/partition";

describe("partitionPriceOptions", () => {
	it("supprime les options que aucune réservation n'a utilisées", () => {
		expect(
			partitionPriceOptions({ optionIds: ["a", "b"], referencedIds: [] }),
		).toEqual({ toDelete: ["a", "b"], toArchive: [] });
	});

	it("conserve celles qui portent une réservation", () => {
		expect(
			partitionPriceOptions({ optionIds: ["a", "b"], referencedIds: ["b"] }),
		).toEqual({ toDelete: ["a"], toArchive: ["b"] });
	});

	it("répartit les cas mixtes en une seule passe", () => {
		expect(
			partitionPriceOptions({
				optionIds: ["a", "b", "c", "d"],
				referencedIds: ["c", "a"],
			}),
		).toEqual({ toDelete: ["b", "d"], toArchive: ["a", "c"] });
	});

	it("n'archive rien quand toutes les options sont déjà facturées", () => {
		expect(
			partitionPriceOptions({
				optionIds: ["a", "b"],
				referencedIds: ["a", "b"],
			}),
		).toEqual({ toDelete: [], toArchive: ["a", "b"] });
	});

	it("ne fait rien quand la durée ne porte aucune option", () => {
		expect(
			partitionPriceOptions({ optionIds: [], referencedIds: ["a"] }),
		).toEqual({ toDelete: [], toArchive: [] });
	});

	it("ignore les références qui ne correspondent à aucune option", () => {
		expect(
			partitionPriceOptions({ optionIds: ["a"], referencedIds: ["zz", "a"] }),
		).toEqual({ toDelete: [], toArchive: ["a"] });
	});
});
