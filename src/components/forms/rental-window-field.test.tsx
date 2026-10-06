// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RentalWindowField } from "./rental-window-field";

afterEach(cleanup);

/**
 * La remarque doit se lire au-dessus de ce qu'elle explique : sous les boutons de
 * durée, au-dessus de la date de retour calculée à partir d'eux.
 */
describe("RentalWindowField — emplacement de la remarque", () => {
	it("rend la remarque entre la durée et la date de retour", () => {
		const { container } = render(
			<RentalWindowField
				pickupDate="2026-04-11"
				returnDate="2026-04-12"
				durations={[1, 2, 3]}
				blockedDurations={[
					{ duration: 2, reason: "aucun tarif 2j pour ce matériel" },
				]}
				durationNote={<p>REMARQUE</p>}
				onChange={() => {}}
			/>,
		);
		const text = container.textContent ?? "";
		const order = ["Durée", "REMARQUE", "Date de retour prévue"].map((label) =>
			text.indexOf(label),
		);
		expect(order.every((index) => index >= 0)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});

	it("n'intercale rien sans remarque", () => {
		const { container } = render(
			<RentalWindowField
				pickupDate="2026-04-11"
				returnDate="2026-04-12"
				durations={[1, 2, 3]}
				onChange={() => {}}
			/>,
		);
		expect(container.textContent).not.toContain("REMARQUE");
	});
});

/**
 * La durée se déduit du retrait : la laisser choisir sans date reviendrait à poser
 * un retrait à la place du client, le jour même, qui peut être un jour de
 * fermeture. Public et caisse demandent donc la date d'abord.
 */
describe("RentalWindowField — durée sans date de départ", () => {
	const AWAITING = "Choisissez d'abord une date de départ.";

	function durationButton(name: RegExp): HTMLButtonElement {
		return screen.getByRole<HTMLButtonElement>("button", { name });
	}

	it("rend toutes les durées inactives et l'annonce", () => {
		render(
			<RentalWindowField
				pickupDate={null}
				returnDate={null}
				durations={[1, 2, 3]}
				onChange={() => {}}
			/>,
		);
		expect(durationButton(/^1 jour/).disabled).toBe(true);
		expect(durationButton(/^2 jours/).disabled).toBe(true);
		expect(durationButton(/^3 jours/).disabled).toBe(true);
		expect(screen.getByText(AWAITING)).toBeDefined();
	});

	it("libère les durées et retire l'annonce dès qu'une date est choisie", () => {
		render(
			<RentalWindowField
				pickupDate="2026-04-11"
				returnDate="2026-04-12"
				durations={[1, 2, 3]}
				onChange={() => {}}
			/>,
		);
		expect(durationButton(/^2 jours/).disabled).toBe(false);
		expect(screen.queryByText(AWAITING)).toBeNull();
	});

	/**
	 * Garde-fou : le refus calendaire reste Prioritaire quand une date est posée,
	 * et l'opt-out laisse les durées cliquables sans date pour un appelant qui
	 * choisirait lui-même la date par défaut.
	 */
	it("conserve le refus calendaire, et respecte l'opt-out", () => {
		const { unmount } = render(
			<RentalWindowField
				pickupDate="2026-04-11"
				returnDate="2026-04-12"
				durations={[1, 2, 3]}
				blockedDurations={[{ duration: 2, reason: "aucun tarif 2j" }]}
				onChange={() => {}}
			/>,
		);
		expect(durationButton(/^2 jours/).disabled).toBe(true);
		expect(durationButton(/^1 jour/).disabled).toBe(false);
		unmount();

		render(
			<RentalWindowField
				pickupDate={null}
				returnDate={null}
				durations={[1, 2, 3]}
				requirePickupDate={false}
				onChange={() => {}}
			/>,
		);
		expect(durationButton(/^2 jours/).disabled).toBe(false);
		expect(screen.queryByText(AWAITING)).toBeNull();
	});

	it("ne rend ni cadenas ni annonce quand le catalogue est vide", () => {
		render(
			<RentalWindowField
				pickupDate={null}
				returnDate={null}
				durations={[]}
				emptyMessage="Aucune durée configurée."
				onChange={() => {}}
			/>,
		);
		expect(screen.queryByText(AWAITING)).toBeNull();
		expect(screen.getByText("Aucune durée configurée.")).toBeDefined();
	});
});
