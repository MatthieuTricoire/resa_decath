// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicStoreSchedule } from "#/features/equipements/public-queries";
import { dayOfWeekFromDateKey } from "#/features/reservations/opening-days";
import {
	DEFAULT_STORE_HOURS,
	openDaysFromHours,
} from "#/features/store-hours/types";
import { addDaysToDateKey, todayInParis } from "#/lib/dates";
import {
	publicCartStore,
	setPublicCartDates,
} from "#/stores/public-cart.store";
import { RentalWindowSelector } from "./rental-window-selector";

const mocks = vi.hoisted(() => ({
	schedule: null as PublicStoreSchedule | null,
}));

vi.mock("#/features/equipements/public-queries", () => ({
	getPublicRentalDurations: vi.fn(async () => [1, 2, 3, 7]),
	getPublicStoreSchedule: vi.fn(async () => mocks.schedule),
}));

afterEach(cleanup);

/** Libellé du seul motif calendaire : le magasin ferme le jour du retour. */
const CLOSED_ONLY =
	"Certaines durées sont indisponibles : le retour tomberait un jour de fermeture du magasin.";

/** Préfixe commun aux trois formulations : la ligne explique toujours un refus. */
const REFUSAL_PREFIX = /^Certaines durées sont indisponibles/;

/** Calendrier de la semaine testée, dérivé des horaires réels du seed. */
function scheduleOf(openEveryDay: boolean): PublicStoreSchedule {
	const hours = openEveryDay
		? DEFAULT_STORE_HOURS.map((entry) => ({ ...entry, isOpen: true }))
		: DEFAULT_STORE_HOURS;
	return {
		openDays: openDaysFromHours(hours),
		hours,
		lastSameDayPickupHour: 15,
	};
}

/**
 * Un vendredi dans un futur proche : le retour est compté bornes incluses, donc
 * seul le 3 jours retombe sur le dimanche. La date est calculée plutôt que figée
 * pour que le test ne périme pas, et prise à plus de sept jours pour ne jamais
 * tomber un jour de repos — ni le seuil du retrait le jour même, qui décalerait
 * la fenêtre.
 */
function aFriday(): string {
	const today = todayInParis();
	const offset = ((5 - (dayOfWeekFromDateKey(today) ?? 0) + 7) % 7) + 7;
	return addDaysToDateKey(today, offset) ?? today;
}

function renderSelector(
	props: ComponentProps<typeof RentalWindowSelector> = {},
	windowDays = 2,
) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const friday = aFriday();
	setPublicCartDates({
		pickupDate: friday,
		returnDate: addDaysToDateKey(friday, windowDays - 1),
	});
	return render(
		<QueryClientProvider client={client}>
			<RentalWindowSelector {...props} />
		</QueryClientProvider>,
	);
}

/**
 * Attend le catalogue des durées. Les deux server functions mockées sont créées
 * au même rendu et se résolvent dans la même vidange de micro-tâches : voir les
 * boutons de durée garantit donc que les horaires, partis du même lot, sont
 * eux aussi arrivés.
 */
function awaitDurations() {
	return screen.findByRole("button", { name: /^7 jours/ });
}

function durationButton(days: number): HTMLButtonElement {
	return screen.getByRole<HTMLButtonElement>("button", {
		name: new RegExp(`^${days} jours?`),
	});
}

/**
 * L'encart ne doit pas être attaché à une page : il suit les durées refusées.
 * C'était le signalement qui l'avait réservé à la seule fiche produit, alors que
 * la durée en cause est refusée partout pour la même raison calendaire.
 */
describe("RentalWindowSelector — encart de durées désactivées", () => {
	it("l'affiche sans matériel en tête, dès qu'une durée est refusée", async () => {
		mocks.schedule = scheduleOf(false);
		renderSelector();
		expect(await screen.findByText(CLOSED_ONLY)).toBeDefined();
		// L'encart annonce un refus réel : 3 jours est bien grisé, 2 jours non.
		expect(durationButton(3).disabled).toBe(true);
		expect(durationButton(2).disabled).toBe(false);
	});

	it("le masque quand la page renonce à la remarque", async () => {
		mocks.schedule = scheduleOf(false);
		renderSelector({ hideDurationNote: true });
		await awaitDurations();
		// Le refus est bien là — c'est la durée qui est grisée — seule la
		// remarque ne s'affiche pas.
		expect(durationButton(3).disabled).toBe(true);
		expect(screen.queryByText(CLOSED_ONLY)).toBeNull();
	});

	it("n'affiche rien quand aucune durée n'est refusée", async () => {
		// Magasin ouvert toute la semaine : plus aucun retour ne tombe un jour fermé.
		mocks.schedule = scheduleOf(true);
		renderSelector();
		await awaitDurations();
		expect(durationButton(3).disabled).toBe(false);
		expect(screen.queryByText(REFUSAL_PREFIX)).toBeNull();
	});

	it("cite le motif tarifaire quand un produit ne vend pas la durée", async () => {
		// Magasin ouvert toute la semaine : aucun refus calendaire, donc le libellé
		// ne peut signaler que la durée non tarifée par le matériel.
		mocks.schedule = scheduleOf(true);
		renderSelector({
			durationSupport: {
				durations: [1, 2, 7],
				priceByDuration: { 1: 20, 2: 30, 7: 80 },
			},
		});
		expect(
			await screen.findByText(
				"Certaines durées sont indisponibles : ce matériel ne se loue pas sur ces durées.",
			),
		).toBeDefined();
		expect(durationButton(3).disabled).toBe(true);
	});

	it("nomme les deux motifs quand deux durées sont refusées pour deux raisons", async () => {
		// Dimanche fermé + 3 jours non tarifé : le même bouton cumulerait deux
		// motifs, or `unpricedDurations` exclut les durées déjà bloquées — la
		// fermeture, plus concrète, l'emporte. Pour que les deux motifs coexistent
		// à l'écran, il faut deux durées distinctes : 3 jours (retour le dimanche)
		// et 7 jours (retour le vendredi suivant, ouvert mais non tarifé).
		mocks.schedule = scheduleOf(false);
		renderSelector({
			durationSupport: {
				durations: [1, 2, 3],
				priceByDuration: { 1: 20, 2: 30, 3: 45 },
			},
		});
		expect(
			await screen.findByText(
				"Certaines durées sont indisponibles : retour un jour de fermeture du magasin, ou durée non proposée pour ce matériel.",
			),
		).toBeDefined();
		expect(durationButton(3).disabled).toBe(true);
		expect(durationButton(7).disabled).toBe(true);
		expect(durationButton(2).disabled).toBe(false);
	});
});

/**
 * Une fenêtre restaurée dont la durée n'est plus au catalogue ne doit pas
 * produire un second message : elle est rabattue sur une durée servie.
 */
describe("RentalWindowSelector — durée hors catalogue", () => {
	it("prolonge sur la durée servie la plus proche, sans afficher d'alerte", async () => {
		mocks.schedule = scheduleOf(true);
		// 5 jours ne sont pas au catalogue [1, 2, 3, 7] : on attend 7 jours.
		renderSelector({}, 5);
		await awaitDurations();
		await waitFor(() => {
			const { pickupDate, returnDate } = publicCartStore.state;
			expect(returnDate).toBe(addDaysToDateKey(pickupDate ?? "", 6));
		});
		expect(screen.queryByText(/n’est pas disponible/)).toBeNull();
	});
});
