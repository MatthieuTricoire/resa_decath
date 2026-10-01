import { useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { toast } from "sonner";
import {
	getPublicCartIdentities,
	type PublicStoreSchedule,
} from "#/features/equipements/public-queries";
import {
	DEFAULT_LAST_SAME_DAY_PICKUP_HOUR,
	earliestPickupDateInParis,
} from "#/lib/dates";
import {
	type PublicCartState,
	publicCartStore,
} from "#/stores/public-cart.store";
import {
	clearStoredCart,
	dropStaleWindow,
	readStoredCart,
	safeSessionStorage,
	writeStoredCart,
} from "#/stores/public-cart-persistence";

/** Le panier a-t-il été relu depuis le `sessionStorage` ? */
const CartHydratedContext = createContext(false);

export function useCartHydrated(): boolean {
	return useContext(CartHydratedContext);
}

/**
 * Rafraîchit l'identité des lignes restaurées et écarte les matériels sortis du
 * circuit : leur slug fait autorité à la réservation, donc une ligne devenue
 * invalide ferait échouer la commande sans raison visible. La fenêtre est
 * laissée telle quelle, le devis se charge de la revalider.
 *
 * Renvoie `null` si rien n'a pu être fait — réseau coupé, indisponibilité — pour
 * que l'appelant garde le panier tel quel plutôt que de le vider.
 */
async function reconcile(
	restored: PublicCartState,
): Promise<PublicCartState | null> {
	// Au-delà de la limite de l'endpoint, on ne réconcilie pas plutôt que de
	// tronquer en silence ; le devis signalera de toute façon les lignes en
	// défaut.
	if (restored.lines.length === 0 || restored.lines.length > 50) return null;

	try {
		const identities = await getPublicCartIdentities({
			data: {
				variantIds: [...new Set(restored.lines.map((line) => line.variantId))],
			},
		});
		const identityByVariant = new Map(
			identities.map((identity) => [identity.variantId, identity]),
		);
		const lines = restored.lines.flatMap((line) => {
			const identity = identityByVariant.get(line.variantId);
			return identity ? [{ ...line, ...identity }] : [];
		});

		const dropped = restored.lines.length - lines.length;
		if (dropped > 0) {
			const removed =
				dropped > 1
					? "ont été retirés du panier : ils ne sont plus louables en ligne."
					: "a été retiré du panier : il n'est plus louable en ligne.";
			toast.info(`${dropped} matériel${dropped > 1 ? "s" : ""} ${removed}`);
		}
		return { ...restored, lines };
	} catch {
		return null;
	}
}

/**
 * Restaure le panier après un rechargement de document, puis le tient à jour.
 *
 * Monté une seule fois par le layout public : un `_public` qui reste monté entre
 * deux navigations ne relit rien, le store en mémoire suffit.
 *
 * L'ordre compte : on lit avant de s'abonner en écriture. Abonné d'abord, le
 * premier `setState` écraserait le panier sauvegardé — c'est le piège de tout
 * store persistant.
 */
export function CartPersistenceProvider({ children }: { children: ReactNode }) {
	const [hydrated, setHydrated] = useState(false);
	const queryClient = useQueryClient();

	useEffect(() => {
		const storage = safeSessionStorage();

		// La restauration est synchrone, elle ne peut donc pas attendre la
		// requête. Le layout public précharge les horaires, le cache est donc
		// déjà rempli ; sinon on retombe sur la valeur par défaut, que le serveur
		// revérifiera de toute façon.
		const schedule = queryClient.getQueryData<PublicStoreSchedule>([
			"public",
			"store-schedule",
		]);
		const cutoffHour =
			schedule?.lastSameDayPickupHour ?? DEFAULT_LAST_SAME_DAY_PICKUP_HOUR;

		const restored = dropStaleWindow(
			readStoredCart(storage) ?? {
				lines: [],
				pickupDate: null,
				returnDate: null,
			},
			// La borne basse suit le garde-fou du jour même : après la coupure,
			// une fenêtre persistée sur aujourd'hui est traitée comme périmée.
			earliestPickupDateInParis(cutoffHour),
		);
		if (restored.lines.length > 0 || restored.pickupDate) {
			publicCartStore.setState(() => restored);
		}

		const subscription = publicCartStore.subscribe((state) => {
			// Un panier vidé après une réservation ne laisse pas de trace.
			if (state.lines.length === 0) clearStoredCart(storage);
			else writeStoredCart(state, storage);
		});

		setHydrated(true);

		void reconcile(publicCartStore.state).then((reconciled) => {
			if (reconciled) publicCartStore.setState(() => reconciled);
		});

		return () => {
			subscription.unsubscribe();
		};
		// Une seule fois par document : c'est le montage initial qui restaure.
		// `queryClient` est stable, le lire ici ne doit pas relancer l'effet.
	}, [queryClient]);

	return (
		<CartHydratedContext.Provider value={hydrated}>
			{children}
		</CartHydratedContext.Provider>
	);
}
