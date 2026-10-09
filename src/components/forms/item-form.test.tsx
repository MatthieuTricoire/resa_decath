// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ItemForm,
	type ItemFormSubmitValues,
	type ItemFormValues,
} from "./item-form";

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

function renderItemForm(
	props: {
		initialValues?: ItemFormValues;
		onSubmit?: (values: ItemFormSubmitValues) => Promise<void>;
	} = {},
) {
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

	it("reprend la saison du produit en modification", async () => {
		renderItemForm({ initialValues: { ...initialItem, season: "winter" } });
		await settle();

		await screen.findByLabelText("Nom");
		expect((screen.getByLabelText("Hiver") as HTMLInputElement).checked).toBe(
			true,
		);
		expect((screen.getByLabelText("Été") as HTMLInputElement).checked).toBe(
			false,
		);
	});

	it("bloque l'envoi tant qu'aucune saison n'est choisie", async () => {
		const onSubmit = vi.fn(async (_values: ItemFormSubmitValues) => undefined);
		renderItemForm({ onSubmit });
		await settle();

		const name = (await screen.findByLabelText("Nom")) as HTMLInputElement;
		fireEvent.change(name, { target: { value: "Tente Quechua" } });
		await settle();

		fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
		await new Promise((resolve) => setTimeout(resolve, 40));

		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toContain(
			"Sélectionnez une saison : été, hiver ou mixte.",
		);

		// Une fois la saison choisie, l'erreur tombe et l'envoi repasse.
		fireEvent.click(screen.getByLabelText("Été"));
		await new Promise((resolve) => setTimeout(resolve, 40));
		expect(screen.queryByText(/Sélectionnez une saison/)).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
		await new Promise((resolve) => setTimeout(resolve, 40));
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0]?.[0].season).toBe("summer");
	});
});
