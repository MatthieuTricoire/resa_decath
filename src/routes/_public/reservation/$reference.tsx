import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Check, MapPin, Phone } from "lucide-react";
import { lineSpecs, WithdrawalCodes } from "#/components/reservation-codes";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { store, storeCanonicalPath } from "#/config/store";
import {
	getPublicReservationWithCodes,
	type PublicReservationLine,
} from "#/features/reservations/public-queries";
import { formatLongDate } from "#/lib/dates";
import { buildPageHead } from "#/lib/seo";
import { formatPrice } from "#/stores/public-cart.store";

/** Confirmation : accessible par référence + jeton, sans compte ni session. */
export const Route = createFileRoute("/_public/reservation/$reference")({
	validateSearch: (search: Record<string, unknown>) => ({
		token: typeof search.token === "string" ? search.token : undefined,
	}),
	head: () =>
		buildPageHead({
			meta: {
				title: "Réservation confirmée",
				description: "Votre réservation de matériel à Laruns est confirmée.",
				canonicalPath: null,
				noIndex: true,
			},
		}),
	component: ConfirmationPage,
});

function ConfirmationPage() {
	const { reference } = Route.useParams();
	const { token } = Route.useSearch();

	const { data, isPending, isError } = useQuery({
		queryKey: ["public", "reservation", reference, token],
		queryFn: () =>
			getPublicReservationWithCodes({
				data: { reference, token: token ?? "" },
			}),
		enabled: Boolean(token),
		retry: false,
	});

	if (!token) {
		return (
			<MissingReservation message="Ouvrez le lien de confirmation reçu lors de la réservation, ou appelez le magasin avec votre référence." />
		);
	}

	if (isPending) {
		return (
			<div className="page-wrap py-16 text-center">
				<p className="text-[var(--sea-ink-soft)]">
					Chargement de votre réservation…
				</p>
			</div>
		);
	}

	if (isError || !data) {
		return (
			<MissingReservation message="Ce lien de confirmation est invalide ou a expiré. Contactez le magasin au {store.phone}." />
		);
	}

	return (
		<div className="page-wrap py-12">
			<div className="mx-auto max-w-3xl space-y-8">
				<header className="rise-in space-y-3 text-center">
					<span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--sea-ink)] text-white">
						<Check className="size-6" aria-hidden="true" />
					</span>
					<p className="island-kicker">Réservation confirmée</p>
					<h1 className="display-title text-4xl font-semibold">
						Merci {data.firstName}
					</h1>
					<p className="text-[var(--sea-ink-soft)]">
						Votre référence est{" "}
						<strong className="text-[var(--sea-ink)]">{data.reference}</strong>.
						Conservez-la : elle vous sera demandée au comptoir.
					</p>
				</header>

				<section className="island-shell rounded-2xl p-6">
					<h2 className="island-kicker">Votre location</h2>
					<ul className="mt-4 space-y-3 text-sm">
						{data.lines.map((line, index) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: les lignes n'ont pas d'id public
								key={`${line.variantLabel ?? line.itemName}-${index}`}
								className="flex items-baseline justify-between gap-3"
							>
								<span>
									{/* Le matériel d'abord, le tarif ensuite : un snapshot de
									    ligne ne porte que le libellé de la durée. */}
									<strong className="text-[var(--sea-ink)]">
										{line.quantity} × {line.itemName}
									</strong>
									<span className="mt-0.5 block text-xs text-[var(--sea-ink-soft)]">
										{lineDetails(line)}
									</span>
								</span>
								<span className="shrink-0">
									{formatPrice(Number(line.unitPrice) * line.quantity)}
								</span>
							</li>
						))}
					</ul>
					<Separator className="my-5" />
					<div className="flex items-baseline justify-between">
						<span className="font-semibold">Total à régler au magasin</span>
						<span className="display-title text-2xl font-semibold">
							{formatPrice(Number(data.totalPrice))}
						</span>
					</div>
				</section>

				<section className="grid gap-6 sm:grid-cols-2">
					<div className="island-shell rounded-2xl p-6">
						<h2 className="island-kicker">Dates</h2>
						<p className="mt-3 flex items-start gap-2 text-sm">
							<CalendarDays
								className="mt-0.5 size-4 shrink-0"
								aria-hidden="true"
							/>
							<span>
								{formatLongDate(data.pickupDate)}
								<br />
								au {formatLongDate(data.returnDate)}
							</span>
						</p>
						<p className="mt-3 text-xs text-[var(--sea-ink-soft)]">
							Retrait {store.pickupWindow}, retour {store.returnWindow}.
						</p>
					</div>
					<div className="island-shell rounded-2xl p-6">
						<h2 className="island-kicker">Retrait au comptoir</h2>
						<p className="mt-3 flex items-start gap-2 text-sm">
							<MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							<span>{store.fullAddress}</span>
						</p>
						<p className="mt-3 flex items-start gap-2 text-sm">
							<Phone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							<a href={store.phoneHref} className="no-underline">
								{store.phone}
							</a>
						</p>
					</div>
				</section>

				<WithdrawalCodes data={data} />

				<div className="flex flex-wrap justify-center gap-3">
					<Button asChild variant="outline">
						<Link to={storeCanonicalPath}>Continuer mes recherches</Link>
					</Button>
				</div>

				<p className="text-center text-xs text-[var(--sea-ink-soft)]">
					Conservez cette page : le récapitulatif et les codes de retrait seront
					demandés au comptoir location. Un récapitulatif a aussi été envoyé à{" "}
					{data.email}.
				</p>
			</div>
		</div>
	);
}

/**
 * Détail d'une ligne sous son intitulé : variante, durée et prix unitaire.
 * Ordre fixe, parties omises quand elles n'apportent rien.
 */
function lineDetails(line: PublicReservationLine): string {
	return [
		...lineSpecs(line),
		`${formatPrice(Number(line.unitPrice))} l’unité`,
	].join(" · ");
}

function MissingReservation({ message }: { message: string }) {
	return (
		<div className="page-wrap py-20 text-center">
			<h1 className="display-title text-3xl font-semibold">
				Réservation introuvable
			</h1>
			<p className="mx-auto mt-3 max-w-md text-[var(--sea-ink-soft)]">
				{message}
			</p>
			<Button asChild className="mt-6">
				<Link to={storeCanonicalPath}>Retour à l’accueil</Link>
			</Button>
		</div>
	);
}
