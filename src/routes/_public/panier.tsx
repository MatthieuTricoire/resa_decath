import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ShoppingBasket, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useCartHydrated } from "#/components/public/cart-persistence";
import { RentalWindowSelector } from "#/components/public/rental-window-selector";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { store, storeCanonicalPath } from "#/config/store";
import type { PublicWindowQuote } from "#/features/equipements/public-queries";
import { getPublicCartQuote } from "#/features/equipements/public-queries";
import { cartLineBlocker } from "#/features/reservations/availability";
import { countRentalDays, rentalDurationLabel } from "#/lib/dates";
import { buildPageHead } from "#/lib/seo";
import {
	cartTotal,
	formatPrice,
	removePublicCartLine,
	setPublicCartLineQuantity,
	usePublicCart,
} from "#/stores/public-cart.store";

/** Panier : récapitulatif, dates et passage à la réservation. */
export const Route = createFileRoute("/_public/panier")({
	head: () =>
		buildPageHead({
			meta: {
				title: "Mon panier",
				description: "Récapitulatif de votre location de matériel à Laruns.",
				canonicalPath: null,
				noIndex: true,
			},
		}),
	component: CartPage,
});

function CartPage() {
	const lines = usePublicCart((state) => state.lines);
	const pickupDate = usePublicCart((state) => state.pickupDate);
	const returnDate = usePublicCart((state) => state.returnDate);
	const clientTotal = usePublicCart(cartTotal);
	const hydrated = useCartHydrated();

	const durationDays =
		pickupDate && returnDate ? countRentalDays(pickupDate, returnDate) : 0;
	const datesComplete = Boolean(pickupDate && returnDate && durationDays > 0);

	// Les prix du panier sont ceux figés à l'ajout : on les re-valorise par le
	// serveur à chaque changement de fenêtre, sinon changer la durée en laisse
	// un total faux.
	const quoteInput = useMemo(
		() => ({
			pickupDate: pickupDate ?? "",
			returnDate: returnDate ?? "",
			lines: lines.map((line) => ({
				variantId: line.variantId,
				quantity: line.quantity,
			})),
		}),
		[lines, pickupDate, returnDate],
	);
	const quote = useQuery({
		queryKey: ["public", "cart-quote", quoteInput],
		queryFn: () => getPublicCartQuote({ data: quoteInput }),
		enabled: datesComplete && lines.length > 0,
		staleTime: 60 * 1000,
	});
	// Le devis ne parle que par identifiant : on garde le nom affiché pour que le
	// client sache quel article est en cause.
	const lineNameByVariant = useMemo(() => {
		const names = new Map<string, string>();
		for (const line of lines) {
			const label = line.variantLabel
				? `${line.productName} (${line.variantLabel})`
				: line.productName;
			names.set(line.variantId, label);
		}
		return names;
	}, [lines]);
	const quotesByVariant = useMemo(() => {
		// La ligne du devis porte la quantité demandée : c'est elle qui sert à
		// décider si la commande dépasse le stock.
		const byVariant = new Map<
			string,
			PublicWindowQuote & { quantity: number }
		>();
		for (const line of quote.data?.lines ?? []) {
			byVariant.set(line.variantId, line);
		}
		return byVariant;
	}, [quote.data]);
	// Une ligne bloque pour deux raisons : le devis serveur la refuse, ou elle
	// dépasse le stock restant pour la fenêtre. Les deux doivent être expliquées
	// au client avant qu'il n'arrive sur une erreur à la soumission.
	const blockersByVariant = new Map(
		(quote.data?.lines ?? []).flatMap((line) => {
			const reason = cartLineBlocker(line);
			return reason ? [[line.variantId, reason] as const] : [];
		}),
	);
	const total = quote.data?.total ?? clientTotal;
	// On ne réserve que sur un devis complet et frais : le serveur revalide
	// tout de même à la soumission, mais le client ne doit pas valider un total
	// périmé.
	const canCheckout = datesComplete && quote.isSuccess && quote.data.complete;
	const navigate = useNavigate();

	// Le CTA mobile (barre sticky) reprend le pattern de la fiche produit : sans
	// dates, on déroule vers le sélecteur plutôt que d'échouer en silence.
	const onStickyCheckout = () => {
		if (!datesComplete) {
			const target = document.getElementById("choisir-dates");
			if (target) {
				const reduce = window.matchMedia(
					"(prefers-reduced-motion: reduce)",
				).matches;
				target.scrollIntoView({
					behavior: reduce ? "auto" : "smooth",
					block: "start",
				});
			}
			return;
		}
		void navigate({ to: "/reservation" });
	};

	return (
		<div className="page-wrap pt-12 pb-32 md:pb-12">
			<Button
				asChild
				variant="ghost"
				size="sm"
				className="mb-6 -ml-3 h-10 sm:h-8"
			>
				<Link to={storeCanonicalPath}>
					<ArrowLeft className="size-4" aria-hidden="true" />
					Continuer mes recherches
				</Link>
			</Button>

			<h1 className="display-title text-4xl font-semibold">Mon panier</h1>

			{/* Avant la relecture du sessionStorage, le store est vide : afficher
			    « panier vide » serait un faux état, et le HTML rendu par le serveur
			    ne dit rien du panier réel. */}
			{lines.length === 0 && hydrated ? (
				<div className="island-shell mt-8 flex flex-col items-start gap-4 rounded-2xl p-8">
					<ShoppingBasket className="size-8" aria-hidden="true" />
					<p className="text-[var(--sea-ink-soft)]">
						Votre panier est vide. Choisissez du matériel pour commencer.
					</p>
					<Button asChild>
						<Link to={storeCanonicalPath}>
							Voir le catalogue
							<ArrowRight className="size-4" aria-hidden="true" />
						</Link>
					</Button>
				</div>
			) : lines.length === 0 ? (
				<p className="mt-8 text-[var(--sea-ink-soft)]">
					Chargement de votre panier…
				</p>
			) : (
				<>
					<div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_0.6fr]">
						<div className="space-y-4">
							{lines.map((line) => {
								const lineQuote = quotesByVariant.get(line.variantId);
								const lineBlocker = lineQuote
									? cartLineBlocker(lineQuote)
									: null;
								const quotedUnitPrice =
									lineQuote?.status === "available"
										? lineQuote.unitPrice
										: null;
								const isPriced = quotedUnitPrice !== null;
								// Sans devis (dates absentes) on garde le prix figé à l'ajout :
								// le bouton « Réserver » reste bloqué de toute façon.
								const unitPrice = quotedUnitPrice ?? line.unitPrice;
								// L'admin a pu changer le tarif de cette option depuis
								// l'ajout : on montre alors les deux prix.
								const priceChanged =
									isPriced && quotedUnitPrice !== null
										? lineQuote?.priceOptionId !== line.priceOptionId
										: false;
								const shownDuration =
									durationDays > 0 ? durationDays : line.duration;
								return (
									<article
										key={line.key}
										className="island-shell flex gap-4 rounded-2xl p-4"
									>
										<div className="size-20 shrink-0 overflow-hidden rounded-xl bg-[var(--sand)]">
											{line.imageUrl ? (
												<img
													src={line.imageUrl}
													alt={line.productName}
													loading="lazy"
													className="size-full object-cover"
												/>
											) : null}
										</div>
										<div className="flex min-w-0 flex-1 flex-col gap-1">
											<p className="island-kicker">{line.activityName}</p>
											<Link
												to="/activite/$activitySlug/$productSlug"
												params={{
													activitySlug: line.activitySlug,
													productSlug: line.productSlug,
												}}
												className="font-semibold no-underline"
											>
												{line.productName}
											</Link>
											<p className="text-sm text-[var(--sea-ink-soft)]">
												{line.variantLabel} ·{" "}
												{rentalDurationLabel(shownDuration)} ·{" "}
												{formatPrice(unitPrice)}
											</p>
											{lineBlocker ? (
												<p className="mt-1 rounded-lg bg-amber-100 p-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
													{lineBlocker}
												</p>
											) : null}
											{/* Le prix reste valable même en rupture : c'est le stock qui
									    bloque, pas le tarif. */}
											{lineQuote?.status === "available" && !lineBlocker ? (
												<p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
													{lineQuote.availableQuantity} exemplaire
													{lineQuote.availableQuantity > 1 ? "s" : ""}{" "}
													disponible
													{lineQuote.availableQuantity > 1 ? "s" : ""} pour ces
													dates.
												</p>
											) : null}
											<div className="mt-2 flex items-center gap-3">
												<label className="flex items-center gap-2 text-sm">
													Qté
													<input
														type="number"
														min={1}
														// Le plafond suit le stock restant : le serveur refuse
														// au-delà, autant ne pas proposer une quantité futile.
														max={
															lineQuote
																? Math.max(1, lineQuote.availableQuantity)
																: 10
														}
														value={line.quantity}
														onChange={(event) =>
															setPublicCartLineQuantity(
																line.key,
																Number(event.target.value) || 0,
															)
														}
														className="w-16 rounded-lg border border-[var(--line)] px-2 py-1.5"
													/>
												</label>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={`Retirer ${line.productName} du panier`}
													onClick={() => removePublicCartLine(line.key)}
												>
													<Trash2 className="size-4" aria-hidden="true" />
												</Button>
											</div>
										</div>
										<div className="flex flex-col items-end gap-1 text-right">
											<p className="font-semibold">
												{formatPrice(unitPrice * line.quantity)}
											</p>
											{priceChanged ? (
												<p className="text-xs text-[var(--sea-ink-soft)]">
													<s>{formatPrice(line.unitPrice * line.quantity)}</s>{" "}
													tarif mis à jour
												</p>
											) : null}
											{lineQuote && !isPriced ? (
												<p className="text-xs text-[var(--sea-ink-soft)]">
													<s>{formatPrice(line.unitPrice * line.quantity)}</s>
												</p>
											) : null}
										</div>
									</article>
								);
							})}
						</div>

						<aside className="island-shell h-fit rounded-2xl p-6">
							<div id="choisir-dates" className="scroll-mt-24">
								<RentalWindowSelector
									heading="Dates de location"
									hint={`Retrait ${store.pickupWindow}, retour ${store.returnWindow}.`}
								/>
							</div>

							<Separator className="my-5" />

							<div
								className="flex items-baseline justify-between"
								aria-busy={quote.isFetching}
							>
								<span className="font-semibold">Total</span>
								<span className="display-title text-2xl font-semibold">
									{formatPrice(total)}
								</span>
							</div>
							{quote.isFetching ? (
								<p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
									Vérification des disponibilités…
								</p>
							) : null}
							{blockersByVariant.size > 0 ? (
								<div className="mt-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
									<p className="font-semibold">
										Ces articles ne sont pas louables :
									</p>
									<ul className="mt-1 list-disc pl-4">
										{[...blockersByVariant].map(([variantId, reason]) => (
											<li key={variantId}>
												{lineNameByVariant.get(variantId) ?? "Article"} —{" "}
												{reason}
											</li>
										))}
									</ul>
								</div>
							) : null}
							{quote.isError ? (
								<p className="mt-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
									Impossible de vérifier la disponibilité. Rechargez la page
									pour réessayer.
								</p>
							) : null}
							<p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
								{store.paymentNotice}
							</p>

							<Button asChild size="lg" className="mt-5 hidden w-full md:block">
								<Link
									to="/reservation"
									aria-disabled={!canCheckout}
									className={
										canCheckout ? undefined : "pointer-events-none opacity-50"
									}
								>
									Réserver
									<ArrowRight className="size-4" aria-hidden="true" />
								</Link>
							</Button>
							{!canCheckout && !quote.isFetching ? (
								<p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
									{!datesComplete
										? "Renseignez vos dates pour continuer."
										: quote.isError
											? "La disponibilité n’a pas pu être vérifiée."
											: "Adaptez les dates ou retirez les articles signalés."}
								</p>
							) : null}
						</aside>
					</div>

					{/* Barre sticky mobile : total + CTA toujours visibles, compensée par
				    le padding bas de la page. */}
					<div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line)] bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur supports-[padding-bottom:env(safe-area-inset-bottom)]:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
						<div className="flex items-center gap-4">
							<div className="flex shrink-0 flex-col">
								<span className="text-xs text-[var(--sea-ink-soft)]">
									Total
								</span>
								<span className="font-semibold">{formatPrice(total)}</span>
							</div>
							<Button
								size="lg"
								className="flex-1"
								onClick={onStickyCheckout}
								aria-disabled={datesComplete && !canCheckout}
								data-disabled={
									datesComplete && !canCheckout ? "true" : undefined
								}
							>
								{!datesComplete ? "Choisir vos dates" : "Réserver"}
								<ArrowRight className="size-4" aria-hidden="true" />
							</Button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
