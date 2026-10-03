import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	describeVariantAttributes,
	type PublicProduct,
	type PublicVariant,
	type PublicWindowQuote,
} from "#/features/equipements/public-queries";
import { exemplairesLabel } from "#/features/reservations/stock-labels";
import { scrollToDates } from "#/lib/scroll";
import {
	addPublicCartLine,
	cartVariantQuantity,
	usePublicCart,
} from "#/stores/public-cart.store";
import { derivePurchaseCta, deriveStockLine } from "./derive-purchase";
import { type BookableQuote, STANDARD_VARIANT_LABEL } from "./derive-selection";

const MAX_QUANTITY = 20;

/**
 * Quantité, bouton d'achat et ajout au panier. La quantité est un état local
 * légitime ; le plafond se déduit du devis et de ce que le panier retient déjà
 * pour la même variante (même stock physique, durées confondues).
 */
export function useProductPurchase({
	product,
	activitySlug,
	activityName,
	selected,
	selectedQuote,
	bookableQuote,
	hasWindow,
	durationNotPriced,
	allSoldOut,
}: {
	product: PublicProduct;
	activitySlug: string;
	activityName: string;
	selected: PublicVariant | null;
	selectedQuote: PublicWindowQuote | null;
	bookableQuote: BookableQuote | null;
	hasWindow: boolean;
	durationNotPriced: boolean;
	allSoldOut: boolean;
}) {
	const router = useRouter();
	const [quantity, setQuantity] = useState(1);

	const alreadyInCart = usePublicCart((state) =>
		selected ? cartVariantQuantity(state, selected.id) : 0,
	);
	// Sans fenêtre on se limite au total en magasin, avec fenêtre on prend ce que
	// le serveur dit rester libre.
	const availableNow = hasWindow
		? (bookableQuote?.availableQuantity ?? 0)
		: (selected?.stock ?? 0);
	const remainingToAdd = Math.max(0, availableNow - alreadyInCart);
	// On ne descend jamais sous 1 : le champ reste utilisable, c'est le CTA qui
	// porte le refus quand il ne reste rien.
	const quantityMax = Math.max(1, Math.min(MAX_QUANTITY, remainingToAdd));
	const soldOut = bookableQuote !== null && remainingToAdd === 0;

	// Changer de dates ou de variante peut rendre la quantité saisie trop grande
	// pour le nouveau stock : on la reborne.
	useEffect(() => {
		setQuantity((current) => Math.min(current, quantityMax));
	}, [quantityMax]);

	const cta = derivePurchaseCta({
		hasWindow,
		durationNotPriced,
		soldOut,
		allSoldOut,
		unitPrice: bookableQuote?.unitPrice ?? null,
		quantity,
	});
	const stockLine = deriveStockLine({
		hasSelection: selected !== null,
		hasWindow,
		stock: selected?.stock ?? 0,
		quotedAvailable: bookableQuote?.availableQuantity ?? null,
		alreadyInCart,
	});

	const addToCart = () => {
		if (!selected || !bookableQuote) {
			toast.error(
				selectedQuote?.message ?? "Choisissez des dates disponibles.",
			);
			return;
		}
		if (quantity > remainingToAdd) {
			toast.error(
				`Il ne reste que ${exemplairesLabel(remainingToAdd)} pour ces dates.`,
			);
			return;
		}
		addPublicCartLine({
			key: `${selected.id}:${bookableQuote.priceOptionId}`,
			productSlug: product.slug,
			productName: product.name,
			activitySlug,
			activityName,
			variantId: selected.id,
			variantLabel:
				describeVariantAttributes(selected.attributes) ??
				STANDARD_VARIANT_LABEL,
			priceOptionId: bookableQuote.priceOptionId,
			duration: bookableQuote.durationDays,
			unitPrice: bookableQuote.unitPrice,
			quantity,
			imageUrl: product.image?.url ?? null,
		});
		toast.success(`${product.name} ajouté à votre réservation`);
		void router.navigate({ to: "/panier" });
	};

	const onBuyClick = () => {
		if (cta.needsDates) {
			scrollToDates();
			return;
		}
		addToCart();
	};

	return { quantity, setQuantity, quantityMax, cta, stockLine, onBuyClick };
}
