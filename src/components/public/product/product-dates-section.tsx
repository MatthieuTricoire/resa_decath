import { RentalWindowSelector } from "#/components/public/rental-window-selector";
import { store } from "#/config/store";
import type { ProductDurationSupport } from "#/features/reservations/pricing";
import { minDurationLabel } from "#/features/reservations/stock-labels";
import { DATES_ANCHOR_ID } from "#/lib/scroll";

/**
 * Sélecteur de dates de la fiche. Il reste atteignable même quand rien n'est
 * vendable : c'est la seule sortie de la page. Les durées du catalogue que ce
 * matériel ne tarifie pas y sont grisées plutôt que retirées.
 */
export function ProductDatesSection({
	minDuration,
	durationSupport,
}: {
	minDuration: number;
	durationSupport: ProductDurationSupport;
}) {
	return (
		<div id={DATES_ANCHOR_ID} className="scroll-mt-24">
			<RentalWindowSelector
				durationSupport={durationSupport}
				hint={`Retrait ${store.pickupWindow}, retour ${store.returnWindow}. ${minDurationLabel(minDuration)}`}
			/>
		</div>
	);
}
