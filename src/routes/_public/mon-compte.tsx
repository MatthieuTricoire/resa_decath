import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Barcode,
	CalendarDays,
	ChevronDown,
	LogOut,
	PackageSearch,
	TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { WithdrawalCodes } from "#/components/reservation-codes";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { store, storeCanonicalPath } from "#/config/store";
import {
	getMyAccount,
	getMyReservationCodes,
	type MyReservationSummary,
} from "#/features/reservations/my-queries";
import { authClient } from "#/lib/auth-client";
import { formatLongDate } from "#/lib/dates";
import { buildPageHead } from "#/lib/seo";
import { formatPrice } from "#/stores/public-cart.store";

/** Espace client : locations en cours et historique, sur la session. */
export const Route = createFileRoute("/_public/mon-compte")({
	// Un lien magique déjà envoyé retourne ici avec `?error=…` quand il est
	// invalide : cas limite, mais il se produit avec les liens émis avant la
	// mise en place d'`errorCallbackURL`.
	validateSearch: (search: Record<string, unknown>): { error?: string } => ({
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	head: () =>
		buildPageHead({
			meta: {
				title: "Mes locations",
				description:
					"Vos locations en cours, vos codes de retrait et votre historique.",
				canonicalPath: null,
				noIndex: true,
			},
		}),
	component: AccountPage,
});

function AccountPage() {
	const { error } = Route.useSearch();
	const { data, isPending, isError } = useQuery({
		queryKey: ["account", "overview"],
		queryFn: () => getMyAccount(),
		retry: false,
	});

	return (
		<div className="page-wrap py-12">
			<div className="mx-auto max-w-3xl space-y-8">
				{error && (
					<p
						role="alert"
						className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
					>
						<TriangleAlert
							className="mt-0.5 size-5 shrink-0 text-destructive"
							aria-hidden="true"
						/>
						<span>
							Ce lien n'est plus valable : demandez-en un nouveau sur la page de
							connexion.
						</span>
					</p>
				)}

				<header className="rise-in space-y-2">
					<p className="island-kicker">Mon compte</p>
					<h1 className="display-title text-3xl font-semibold">
						Mes locations
					</h1>
				</header>

				{isPending && (
					<p className="text-[var(--sea-ink-soft)]">
						Chargement de vos locations…
					</p>
				)}

				{isError && (
					<p className="text-[var(--sea-ink-soft)]">
						Impossible de charger vos locations. Rechargez la page.
					</p>
				)}

				{data?.signedIn === false && <NotSignedIn />}

				{data?.signedIn === true && (
					<>
						{signOutButton()}
						<CurrentReservations reservations={data.current} />
						<PastReservations reservations={data.past} />
					</>
				)}
			</div>
		</div>
	);
}

/** Bouton de déconnexion, isolé pour que le composant reste lisible. */
function signOutButton() {
	return (
		<div className="flex justify-end">
			<Button
				variant="outline"
				size="sm"
				onClick={async () => {
					await authClient.signOut();
					window.location.href = "/connexion";
				}}
			>
				<LogOut className="size-4" aria-hidden="true" />
				Se déconnecter
			</Button>
		</div>
	);
}

function NotSignedIn() {
	return (
		<section className="island-shell rounded-2xl p-6 text-center">
			<span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--sea-ink)] text-white">
				<PackageSearch className="size-6" aria-hidden="true" />
			</span>
			<h2 className="display-title mt-4 text-2xl font-semibold">
				Retrouvez vos locations
			</h2>
			<p className="mx-auto mt-2 max-w-md text-sm text-[var(--sea-ink-soft)]">
				Connectez-vous avec l’email de votre réservation pour voir vos locations
				en cours, vos codes de retrait et votre historique.
			</p>
			<Button asChild className="mt-6">
				<Link to="/connexion">Recevoir mon lien de connexion</Link>
			</Button>
		</section>
	);
}

function CurrentReservations({
	reservations,
}: {
	reservations: MyReservationSummary[];
}) {
	if (reservations.length === 0) {
		return (
			<section className="island-shell rounded-2xl p-6">
				<h2 className="island-kicker">En cours</h2>
				<p className="mt-3 text-sm text-[var(--sea-ink-soft)]">
					Aucune location en cours. Réservez du matériel et il apparaîtra ici,
					avec ses codes de retrait.
				</p>
				<Button asChild variant="outline" className="mt-4">
					<Link to={storeCanonicalPath}>Voir le matériel</Link>
				</Button>
			</section>
		);
	}

	return (
		<section className="space-y-4">
			<h2 className="island-kicker">En cours</h2>
			{reservations.map((reservation) => (
				<ReservationCard
					key={reservation.id}
					reservation={reservation}
					withCodes
				/>
			))}
		</section>
	);
}

function PastReservations({
	reservations,
}: {
	reservations: MyReservationSummary[];
}) {
	if (reservations.length === 0) return null;
	return (
		<section className="space-y-4">
			<h2 className="island-kicker">Historique</h2>
			{reservations.map((reservation) => (
				<ReservationCard key={reservation.id} reservation={reservation} />
			))}
		</section>
	);
}

function ReservationCard({
	reservation,
	withCodes = false,
}: {
	reservation: MyReservationSummary;
	withCodes?: boolean;
}) {
	return (
		<article className="island-shell rounded-2xl p-6">
			<header className="flex flex-wrap items-baseline justify-between gap-3">
				<div>
					<p className="font-mono text-sm font-semibold tracking-[0.06em]">
						{reservation.reference}
					</p>
					<p className="mt-1 flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
						<CalendarDays className="size-4 shrink-0" aria-hidden="true" />
						{formatLongDate(reservation.pickupDate)} →{" "}
						{formatLongDate(reservation.returnDate)}
					</p>
				</div>
				<div className="flex items-center gap-3">
					{reservation.overdue && (
						<Badge variant="destructive">En retard</Badge>
					)}
					<span className="text-sm text-[var(--sea-ink-soft)]">
						{reservation.totalQuantity} article
						{reservation.totalQuantity > 1 ? "s" : ""} ·{" "}
						{formatPrice(Number(reservation.totalPrice))}
					</span>
				</div>
			</header>

			<Separator className="my-4" />

			<ul className="space-y-2 text-sm">
				{reservation.lines.map((line) => (
					<li
						key={line.key}
						className="flex flex-wrap items-baseline justify-between gap-2"
					>
						<span>
							<strong>{line.quantity > 1 ? `${line.quantity} × ` : ""}</strong>
							{line.itemName}
							{line.variantLabel && (
								<span className="text-[var(--sea-ink-soft)]">
									{" "}
									· {line.variantLabel}
								</span>
							)}
						</span>
						{line.href ? (
							<Link to={line.href} className="text-sm underline">
								Revoir ce matériel
							</Link>
						) : (
							<span className="text-xs text-[var(--sea-ink-soft)]">
								Plus au catalogue
							</span>
						)}
					</li>
				))}
			</ul>

			{withCodes && <CodesPanel reservationId={reservation.id} />}

			<p className="mt-4 text-xs text-[var(--sea-ink-soft)]">
				Retrait {store.pickupWindow}, retour {store.returnWindow}.
			</p>
		</article>
	);
}

/**
 * Les codes de retrait, chargés à la demande.
 *
 * Repliés par défaut : les images pèsent environ une vingtaine de Ko par
 * unité, et un client qui consulte son historique n'a pas besoin de les
 * charger. Seules les locations en cours les proposent, puisque c'est là qu'on
 * les scanne.
 */
function CodesPanel({ reservationId }: { reservationId: string }) {
	const [open, setOpen] = useState(false);
	const { data, isPending } = useQuery({
		queryKey: ["account", "codes", reservationId],
		queryFn: () => getMyReservationCodes({ data: { id: reservationId } }),
		enabled: open,
		retry: false,
	});

	return (
		<div className="mt-5">
			<Button
				variant="outline"
				size="sm"
				onClick={() => setOpen((previous) => !previous)}
				aria-expanded={open}
			>
				<Barcode className="size-4" aria-hidden="true" />
				{open ? "Masquer mes codes" : "Afficher mes codes de retrait"}
				<ChevronDown
					className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
					aria-hidden="true"
				/>
			</Button>

			{open && (
				<div className="mt-4">
					{isPending && (
						<p className="text-sm text-[var(--sea-ink-soft)]">
							Génération des codes…
						</p>
					)}
					{data && <WithdrawalCodes data={data} />}
					{!isPending && !data && (
						<p className="text-sm text-[var(--sea-ink-soft)]">
							Impossible de charger les codes de cette réservation.
						</p>
					)}
				</div>
			)}
		</div>
	);
}
