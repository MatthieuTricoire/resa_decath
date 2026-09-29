import {
	createFileRoute,
	Link,
	Outlet,
	useParams,
	useRouter,
} from "@tanstack/react-router";
import { ArrowLeft, Loader2, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { useAppForm } from "#/components/forms/app-form";
import { useCartHydrated } from "#/components/public/cart-persistence";
import { Button } from "#/components/ui/button";
import { Field, FieldGroup } from "#/components/ui/field";
import { Separator } from "#/components/ui/separator";
import { store, storeCanonicalPath } from "#/config/store";
import { publicReservationSchema } from "#/features/reservations/public.schema";
import { reservePublicReservation } from "#/features/reservations/public-queries";
import { formatLongDate } from "#/lib/dates";
import { buildPageHead } from "#/lib/seo";
import {
	cartTotal,
	clearPublicCart,
	formatPrice,
	usePublicCart,
} from "#/stores/public-cart.store";

/** Étape identité : pas de compte, pas de paiement en ligne. */
export const Route = createFileRoute("/_public/reservation")({
	head: () =>
		buildPageHead({
			meta: {
				title: "Finaliser ma réservation",
				description: "Renseignez vos coordonnées pour confirmer la location.",
				canonicalPath: null,
				noIndex: true,
			},
		}),
	component: ReservationPage,
});

function ReservationPage() {
	// La confirmation est une route enfant : sans cet Outlet, `/reservation/x`
	// réafficherait le formulaire au lieu de la confirmation.
	const { reference } = useParams({ strict: false });
	if (reference) return <Outlet />;
	return <ReservationForm />;
}

function ReservationForm() {
	const router = useRouter();
	const lines = usePublicCart((state) => state.lines);
	const pickupDate = usePublicCart((state) => state.pickupDate);
	const returnDate = usePublicCart((state) => state.returnDate);
	const total = usePublicCart(cartTotal);
	const hydrated = useCartHydrated();

	const form = useAppForm({
		defaultValues: {
			firstName: "",
			lastName: "",
			email: "",
			phone: "",
			loyaltyCard: "",
		},
		validators: { onChange: publicReservationSchema },
		onSubmit: async ({ value }) => {
			if (!pickupDate || !returnDate) {
				toast.error("Renseignez vos dates de location.");
				return;
			}
			try {
				const result = await reservePublicReservation({
					data: {
						...value,
						pickupDate,
						returnDate,
						lines: lines.map((line) => ({
							productSlug: line.productSlug,
							variantId: line.variantId,
							priceOptionId: line.priceOptionId,
							quantity: line.quantity,
						})),
					},
				});
				clearPublicCart();
				await router.navigate({
					to: "/reservation/$reference",
					params: { reference: result.reference },
					search: { token: result.accessToken },
				});
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Impossible de finaliser la réservation.",
				);
			}
		},
	});

	// Tant que le panier n'est pas relu du sessionStorage, le store est vide :
	// annoncer « panier vide » ici serait un faux état sur une page dont le HTML
	// vient du serveur.
	if (lines.length === 0 && hydrated) {
		return (
			<div className="page-wrap py-16 text-center">
				<h1 className="display-title text-3xl font-semibold">
					Votre panier est vide
				</h1>
				<p className="mt-3 text-[var(--sea-ink-soft)]">
					Ajoutez du matériel avant de finaliser une réservation.
				</p>
				<Button asChild className="mt-6">
					<Link to={storeCanonicalPath}>Voir le catalogue</Link>
				</Button>
			</div>
		);
	}

	if (lines.length === 0) {
		return (
			<div className="page-wrap py-16 text-center text-[var(--sea-ink-soft)]">
				Chargement de votre panier…
			</div>
		);
	}

	return (
		<div className="page-wrap py-12">
			<Button
				asChild
				variant="ghost"
				size="sm"
				className="h-10 sm:h-8 mb-6 -ml-3"
			>
				<Link to="/panier">
					<ArrowLeft className="size-4" aria-hidden="true" />
					Retour au panier
				</Link>
			</Button>

			<h1 className="display-title text-4xl font-semibold">
				Finaliser la réservation
			</h1>
			<p className="mt-2 text-[var(--sea-ink-soft)]">
				Aucun compte à créer, aucun paiement en ligne : vous payez et retirez au
				magasin.
			</p>

			<div className="mt-8 grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						form.handleSubmit();
					}}
				>
					<FieldGroup className="[&_[data-slot=input]]:h-11 lg:[&_[data-slot=input]]:h-9">
						<div className="grid gap-4 sm:grid-cols-2">
							<form.AppField name="firstName">
								{(field) => <field.TextField label="Prénom" />}
							</form.AppField>
							<form.AppField name="lastName">
								{(field) => <field.TextField label="Nom" />}
							</form.AppField>
						</div>
						<form.AppField name="email">
							{(field) => (
								<field.TextField
									label="Email"
									type="email"
									placeholder="vous@exemple.fr"
									description="Vous recevrez les informations à présenter en caisse lors du retrait sur cet email."
								/>
							)}
						</form.AppField>
						<form.AppField name="phone">
							{(field) => (
								<field.TextField
									label="Téléphone"
									type="tel"
									placeholder="06 12 34 56 78"
								/>
							)}
						</form.AppField>
						<form.AppField name="loyaltyCard">
							{(field) => (
								<field.TextField
									label="Carte de fidélité (facultatif)"
									placeholder="Facultatif"
								/>
							)}
						</form.AppField>

						<Field>
							<form.Subscribe
								selector={(state) =>
									[state.canSubmit, state.isSubmitting] as const
								}
							>
								{([canSubmit, isSubmitting]) => (
									<Button
										type="submit"
										size="lg"
										className="w-full"
										disabled={!canSubmit || isSubmitting}
									>
										{isSubmitting ? (
											<>
												<Loader2
													className="size-4 animate-spin"
													aria-hidden="true"
												/>
												Réservation en cours…
											</>
										) : (
											"Confirmer la réservation"
										)}
									</Button>
								)}
							</form.Subscribe>
						</Field>
					</FieldGroup>
				</form>

				<aside className="island-shell h-fit rounded-2xl p-6">
					<h2 className="island-kicker">Récapitulatif</h2>
					{pickupDate && returnDate && (
						<p className="mt-3 text-sm">
							{formatLongDate(pickupDate)} → {formatLongDate(returnDate)}
						</p>
					)}
					<ul className="mt-4 space-y-2 text-sm">
						{lines.map((line) => (
							<li
								key={line.key}
								className="flex items-baseline justify-between gap-3"
							>
								<span className="text-[var(--sea-ink-soft)]">
									{line.quantity} × {line.productName}
								</span>
								<span>{formatPrice(line.unitPrice * line.quantity)}</span>
							</li>
						))}
					</ul>
					<Separator className="my-5" />
					<div className="flex items-baseline justify-between">
						<span className="font-semibold">Total à régler</span>
						<span className="display-title text-2xl font-semibold">
							{formatPrice(total)}
						</span>
					</div>

					<div className="mt-6 space-y-2 text-sm text-[var(--sea-ink-soft)]">
						<p className="flex items-start gap-2">
							<MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							{store.fullAddress}
						</p>
						<p className="flex items-start gap-2">
							<Phone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							{store.phone}
						</p>
					</div>
					<p className="mt-4 text-xs text-[var(--sea-ink-soft)]">
						{store.paymentNotice}
					</p>
				</aside>
			</div>
		</div>
	);
}
