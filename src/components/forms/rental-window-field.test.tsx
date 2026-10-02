// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
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
