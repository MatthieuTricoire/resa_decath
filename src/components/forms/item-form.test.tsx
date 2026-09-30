// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItemForm, type ItemFormValues } from "./item-form";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		...props
	}: {
		children?: ReactNode;
	} & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a {...props}>{children}</a>
	),
}));

vi.mock("#/features/equipements/queries", () => ({
	getCategories: vi.fn(async () => []),
}));

vi.mock("#/features/durees/queries", () => ({
	getRentalDurations: vi.fn(async () => []),
}));

vi.mock("#/features/attributs/queries", () => ({
	getAttributeDefinitions: vi.fn(async () => []),
}));

const initialItem: ItemFormValues = {
	name: "Sac à dos MH500",
	description: "",
	brand: "Decathlon",
	categoryId: "",
	season: "all",
	decathlonUrl: "",
	images: [],
	availableFrom: "",
	availableTo: "",
	minDuration: 1,
	slug: "sac-a-dos-mh500",
	variants: [
		{
			id: "variant-1",
			sku: "MH500-2026",
			totalStock: 3,
			attributes: [],
			priceOptions: [],
		},
	],
};

function renderItemForm(props: { initialValues?: ItemFormValues } = {}) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<ItemForm
				submitLabel="Enregistrer"
				onSubmit={async () => undefined}
				{...props}
			/>
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

/** Laisse les promesses de React Query se résoudre (donc re-rendre le formulaire). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("ItemForm", () => {
	it("ne boucle pas sur les valeurs par défaut générées", async () => {
		const randomUUID = vi.spyOn(crypto, "randomUUID");
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		// Un parent réel recrée le JSX à chaque rendu : on refait pareil, sinon
		// React réutilise l'élément et ne redessine pas le formulaire.
		const build = () => (
			<QueryClientProvider client={queryClient}>
				<ItemForm submitLabel="Enregistrer" onSubmit={async () => undefined} />
			</QueryClientProvider>
		);

		const { rerender } = render(build());
		await screen.findByLabelText("Nom");
		// Laisse les requêtes (catégories, durées, attributs) résoudre : c'est
		// ce re-rendu-là qui déclenchait la boucle de 50 rendus synchrones.
		await settle();
		rerender(build());
		await settle();

		// Avant correctif : 53 UUID générés au montage seul, puis React lève
		// « Maximum update depth exceeded ». Une seule variante est créée au
		// montage, les identifiants doivent donc rester stables.
		expect(randomUUID.mock.calls.length).toBeLessThanOrEqual(1);
		expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
			"Maximum update depth",
		);
		expect(screen.getByLabelText("Nom")).toBeDefined();
	});

	it("hydrate les champs depuis les valeurs initiales", async () => {
		renderItemForm({ initialValues: initialItem });
		await settle();

		const name = (await screen.findByLabelText("Nom")) as HTMLInputElement;
		const slug = screen.getByLabelText("Slug d’URL") as HTMLInputElement;
		expect(name.value).toBe("Sac à dos MH500");
		expect(slug.value).toBe("sac-a-dos-mh500");
	});
});
