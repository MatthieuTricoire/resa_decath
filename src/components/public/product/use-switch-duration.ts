import { toast } from "sonner";
import { useRentalWindow } from "#/components/public/rental-window/use-rental-window";
import { rentalDurationLabel } from "#/lib/dates";
import { cartItemCount, usePublicCart } from "#/stores/public-cart.store";

/**
 * Change la durée de la fenêtre depuis une fiche produit. La fenêtre est celle
 * de toute la commande : on prévient avant de la changer sous les pieds d'un
 * panier déjà rempli. La pose passe par `applyWindow`, comme le sélecteur, avec
 * les durées du matériel pour candidates.
 */
export function useSwitchDuration(productDurations: number[]) {
	const { pickupDate, earliestPickupDate, applyWindow } = useRentalWindow();
	const cartCount = usePublicCart(cartItemCount);

	return (nextDuration: number) => {
		// Date la plus proche servie côté public : aujourd'hui avant la coupure,
		// sinon demain — jamais une fenêtre du jour même une fois celle-ci passée.
		const pickup = pickupDate ?? earliestPickupDate;
		if (cartCount > 0) {
			toast.info(
				"La durée s’applique à toute votre commande : les autres articles du panier seront recalculés et devront peut-être être retirés.",
			);
		}
		const applied = applyWindow(pickup, nextDuration, productDurations);
		if (applied === 0) {
			toast.info(
				"Le retour ne peut pas tomber un jour de fermeture : choisissez une autre date de retrait.",
			);
		} else if (applied !== nextDuration) {
			toast.info(
				`Le retour ne peut pas tomber un jour de fermeture : ${rentalDurationLabel(applied)} appliquée.`,
			);
		}
	};
}
