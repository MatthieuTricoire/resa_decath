import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ShoppingBasket, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CartDatesSummary } from "#/components/public/cart-dates-summary";
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
	type PublicCartLine,
	removePublicCartLine,
	setPublicCartLineQuantity,
	usePublicCart,
} from "#/stores/public-cart.store";

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
	const navigate = useNavigate();
	const [datesOpen, setDatesOpen] = useState(false);
	const datesRef = useRef<HTMLElement>(null);

	const durationDays =
		pickupDate && returnDate ? countRentalDays(pickupDate, returnDate) : 0;
	const datesComplete = Boolean(pickupDate && returnDate && durationDays > 0);

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
		queryKey: ["public", "cart-quote", quoteInput] as const,
		queryFn: () => getPublicCartQuote({ data: quoteInput }),
		enabled: datesComplete && lines.length > 0,
		staleTime: 60 * 1000,
		placeholderData: keepPreviousData,
	});

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
		const byVariant = new Map<
			string,
			PublicWindowQuote & { quantity: number }
		>();
		for (const line of quote.data?.lines ?? []) {
			byVariant.set(line.variantId, line);
		}
		return byVariant;
	}, [quote.data]);

	const blockersByVariant = useMemo(() => {
		return new Map(
			(quote.data?.lines ?? []).flatMap((line) => {
				const reason = cartLineBlocker(line);
				return reason ? [[line.variantId, reason] as const] : [];
			}),
		);
	}, [quote.data]);

	const total = quote.data?.total ?? clientTotal;
	const canCheckout = datesComplete && quote.isSuccess && quote.data.complete;

	// Le panier est le seul endroit où la fenêtre se modifie : le sélecteur est
	// donc monté ici, et son ouverture suit le ScrollIntoView plutôt qu'un retour
	// en haut de page. Sur mobile l'encart est sous la liste des articles, ouvrir
	// sans défiler laisserait le clic sans effet visible.
	const toggleDates = () => setDatesOpen((open) => !open);

	const revealDates = () => {
		setDatesOpen(true);
		const reduce = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		datesRef.current?.scrollIntoView({
			block: "nearest",
			behavior: reduce ? "auto" : "smooth",
		});
	};

	const onStickyCheckout = () => {
		if (!datesComplete) {
			revealDates();
			return;
		}
		void navigate({ to: "/reservation" });
	};

	return (
		<div className="container mx-auto px-4 pt-12 pb-32 sm:px-6 md:pb-12">
			<Button
				asChild
				variant="ghost"
				size="sm"
				className="mb-6 -ml-3 h-10 sm:h-8"
			>
				<Link to={storeCanonicalPath}>
					<ArrowLeft className="mr-2 size-4" aria-hidden="true" />
					Continuer mes recherches
				</Link>
			</Button>

			<h1 className="text-4xl font-semibold tracking-tight text-foreground">
				Mon panier
			</h1>

			{lines.length === 0 && hydrated ? (
				<div className="mt-8 flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm">
					<ShoppingBasket
						className="size-8 text-muted-foreground"
						aria-hidden="true"
					/>
					<p className="text-muted-foreground">
						Votre panier est vide. Choisissez du matériel pour commencer.
					</p>
					<Button asChild>
						<Link to={storeCanonicalPath}>
							Voir le catalogue
							<ArrowRight className="ml-2 size-4" aria-hidden="true" />
						</Link>
					</Button>
				</div>
			) : lines.length === 0 ? (
				<p className="mt-8 text-muted-foreground">
					Chargement de votre panier…
				</p>
			) : (
				<>
					<div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_0.6fr]">
						<div className="space-y-4">
							{lines.map((line) => (
								<CartLineItem
									key={line.key}
									line={line}
									durationDays={durationDays}
									lineQuote={quotesByVariant.get(line.variantId)}
								/>
							))}
						</div>

						<aside
							ref={datesRef}
							className="h-fit scroll-mt-24 rounded-2xl border border-border bg-card p-6 shadow-sm"
						>
							<CartDatesSummary
								pickupDate={pickupDate}
								returnDate={returnDate}
								durationDays={durationDays}
								onEdit={toggleDates}
							/>

							{datesOpen ? (
								<RentalWindowSelector
									className="mt-5"
									heading="Modifier vos dates"
									hideDurationNote
								/>
							) : null}

							<Separator className="my-5" />

							<div
								className="flex items-baseline justify-between"
								aria-busy={quote.isFetching}
							>
								<span className="font-semibold text-foreground">Total</span>
								<span className="text-2xl font-semibold text-foreground">
									{formatPrice(total)}
								</span>
							</div>

							{blockersByVariant.size > 0 ? (
								<div className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm text-destructive dark:bg-destructive/20 dark:text-red-400">
									<p className="font-semibold">
										Ces articles ne sont pas louables :
									</p>
									<ul className="mt-2 list-disc pl-5 space-y-1">
										{[...blockersByVariant].map(([variantId, reason]) => (
											<li key={variantId}>
												<span className="font-medium">
													{lineNameByVariant.get(variantId) ?? "Article"}
												</span>{" "}
												— {reason}
											</li>
										))}
									</ul>
								</div>
							) : null}

							{quote.isError ? (
								<p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/20 dark:text-red-400">
									Impossible de vérifier la disponibilité. Rechargez la page
									pour réessayer.
								</p>
							) : null}

							<p className="mt-3 text-xs text-muted-foreground leading-relaxed">
								{store.paymentNotice}
							</p>

							<Button asChild size="lg" className="mt-6 hidden w-full md:flex">
								<Link
									to="/reservation"
									aria-disabled={!canCheckout}
									className={
										canCheckout ? undefined : "pointer-events-none opacity-50"
									}
								>
									Réserver
									<ArrowRight className="ml-2 size-4" aria-hidden="true" />
								</Link>
							</Button>

							{!canCheckout && !quote.isFetching ? (
								<p className="mt-3 text-center text-xs font-medium text-muted-foreground">
									{!datesComplete
										? "Renseignez vos dates pour continuer."
										: quote.isError
											? "La disponibilité n’a pas pu être vérifiée."
											: "Adaptez les dates ou retirez les articles signalés."}
								</p>
							) : null}
						</aside>
					</div>

					<div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur supports-[padding-bottom:env(safe-area-inset-bottom)]:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
						<div className="flex items-center gap-4">
							<div className="flex shrink-0 flex-col">
								<span className="text-xs text-muted-foreground">Total</span>
								<span className="font-semibold text-foreground">
									{formatPrice(total)}
								</span>
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
								<ArrowRight className="ml-2 size-4" aria-hidden="true" />
							</Button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}

function CartLineItem({
	line,
	durationDays,
	lineQuote,
}: {
	line: PublicCartLine;
	durationDays: number;
	lineQuote?: PublicWindowQuote & { quantity: number };
}) {
	const lineBlocker = lineQuote ? cartLineBlocker(lineQuote) : null;
	const quotedUnitPrice =
		lineQuote?.status === "available" ? lineQuote.unitPrice : null;
	const isPriced = quotedUnitPrice !== null;
	const unitPrice = quotedUnitPrice ?? line.unitPrice;

	const priceChanged =
		isPriced && quotedUnitPrice !== null
			? lineQuote?.priceOptionId !== line.priceOptionId
			: false;

	const shownDuration = durationDays > 0 ? durationDays : line.duration;

	return (
		<article className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/20">
			<div className="size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
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
				<p className="text-xs font-semibold uppercase tracking-wider text-primary">
					{line.activityName}
				</p>
				<Link
					to="/activite/$activitySlug/$productSlug"
					params={{
						activitySlug: line.activitySlug,
						productSlug: line.productSlug,
					}}
					className="font-semibold text-foreground no-underline hover:underline"
				>
					{line.productName}
				</Link>
				<p className="text-sm text-muted-foreground">
					{line.variantLabel} · {rentalDurationLabel(shownDuration)} ·{" "}
					{formatPrice(unitPrice)}
				</p>

				{lineBlocker ? (
					<p className="mt-1 rounded-lg bg-destructive/10 p-2 text-xs font-medium text-destructive dark:bg-destructive/20 dark:text-red-400">
						{lineBlocker}
					</p>
				) : null}

				{lineQuote?.status === "available" && !lineBlocker ? (
					<p className="mt-1 text-xs text-muted-foreground">
						{lineQuote.availableQuantity} exemplaire
						{lineQuote.availableQuantity > 1 ? "s" : ""} disponible
						{lineQuote.availableQuantity > 1 ? "s" : ""} pour ces dates.
					</p>
				) : null}

				<div className="mt-2 flex items-center gap-3">
					<label className="flex items-center gap-2 text-sm text-foreground">
						Qté
						<input
							type="number"
							min={1}
							max={lineQuote ? Math.max(1, lineQuote.availableQuantity) : 10}
							value={line.quantity}
							onChange={(event) =>
								setPublicCartLineQuantity(
									line.key,
									Number(event.target.value) || 0,
								)
							}
							className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
						/>
					</label>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
						aria-label={`Retirer ${line.productName} du panier`}
						onClick={() => removePublicCartLine(line.key)}
					>
						<Trash2 className="size-4" aria-hidden="true" />
					</Button>
				</div>
			</div>

			<div className="flex flex-col items-end gap-1 text-right">
				<p className="font-semibold text-foreground">
					{formatPrice(unitPrice * line.quantity)}
				</p>
				{priceChanged ? (
					<p className="text-xs text-muted-foreground">
						<s>{formatPrice(line.unitPrice * line.quantity)}</s> tarif mis à
						jour
					</p>
				) : null}
				{lineQuote && !isPriced ? (
					<p className="text-xs text-muted-foreground">
						<s>{formatPrice(line.unitPrice * line.quantity)}</s>
					</p>
				) : null}
			</div>
		</article>
	);
}
