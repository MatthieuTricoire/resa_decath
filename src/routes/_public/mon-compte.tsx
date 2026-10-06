import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Barcode,
	CalendarDays,
	ChevronDown,
	LogOut,
	PackageSearch,
	TriangleAlert,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "#/components/dialogs/ConfirmDeleteDialog";
import { WithdrawalCodes } from "#/components/reservation-codes";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { store, storeCanonicalPath } from "#/config/store";
import {
	cancelReservation,
	getMyAccount,
	getMyReservationCodes,
	type MyReservationSummary,
} from "#/features/reservations/my-queries";
import { authClient } from "#/lib/auth-client";
import { formatLongDate } from "#/lib/dates";
import { buildPageHead } from "#/lib/seo";
import { openDialog } from "#/stores/dialog.store";
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

				{/* Montée ici et non dans la carte : la dialog vit dans le store,
				    pas dans la réservation qu'elle annule. */}
				<ConfirmDeleteDialog />
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

/**
 * Statuts où le client peut encore annuler.
 *
 * Doit rester aligné sur `CLIENT_CANCELLABLE_STATUSES` de `my-queries.server.ts`,
 * qui fait autorité : le serveur vérifie, cette liste n'évite que d'afficher un
 * bouton qui échouerait. Un désaccord ici n'affaiblit pas la sécurité, il rend
 * juste l'interface fausse.
 */
const CANCELLABLE = ["CONFIRMED"];

/**
 * Libellés des statuts qui ne sont pas « en cours ».
 *
 * `CONFIRMED` et `COLLECTED` n'ont pas d'entrée : ce sont les locations en
 * cours, la section s'en charge. Les autres ont besoin d'une explication —
 * sans elle, une réservation annulée et une location terminée sont la même
 * carte, et le client ne comprend pas pourquoi elle a disparu de « En cours ».
 */
const STATUS_LABELS: Record<string, string> = {
	RETURNED: "Retournée",
	CANCELLED: "Annulée",
};

function ReservationCard({
	reservation,
	withCodes = false,
}: {
	reservation: MyReservationSummary;
	withCodes?: boolean;
}) {
	const canCancel = CANCELLABLE.includes(reservation.status);
	const statusLabel = STATUS_LABELS[reservation.status];

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
					{statusLabel && (
						<Badge
							variant={
								reservation.status === "CANCELLED" ? "destructive" : "secondary"
							}
						>
							{statusLabel}
						</Badge>
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

			{canCancel && (
				<div className="mt-5">
					<CancelReservationButton reservation={reservation} />
				</div>
			)}

			<p className="mt-4 text-xs text-[var(--sea-ink-soft)]">
				Retrait {store.pickupWindow}, retour {store.returnWindow}.
			</p>
		</article>
	);
}

/**
 * Annulation d'une réservation, confirmée.
 *
 * `CANCELLED` est un état sans sortie : aucun statut n'y mène ailleurs, donc
 * une annulation ne s'annule pas. D'où la confirmation, et non un bouton
 * « Annuler » qui supprime sans prévenir — le matériel redevient immédiatement
 * réservable par quelqu'un d'autre.
 *
 * La dialog est celle du projet (`ConfirmDeleteDialog`), alimentée par
 * `dialogStore` : même rendu, même clôture sur « Annuler », même libellé
 * d'action configurable. Elle ferme après `onConfirm`, la mutation se joue donc
 * pendant que la dialog disparaît.
 */
function CancelReservationButton({
	reservation,
}: {
	reservation: MyReservationSummary;
}) {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: () => cancelReservation({ data: { id: reservation.id } }),
		onSuccess: (cancelled) => {
			if (cancelled) {
				toast.success(`Réservation ${cancelled.reference} annulée.`);
			}
			// La liste est rafraîchie dans les deux cas : un `null` signifie que la
			// réservation n'était plus annulable, donc l'écran était devenu faux.
			queryClient.invalidateQueries({ queryKey: ["account", "overview"] });
		},
		onError: (error: unknown) => {
			toast.error(
				error instanceof Error
					? `Annulation impossible : ${error.message}`
					: "Annulation impossible.",
			);
		},
	});

	const askConfirmation = () =>
		openDialog("confirmDelete", {
			title: "Annuler cette réservation",
			description: `La réservation ${reservation.reference} sera annulée définitivement. Le matériel redeviendra disponible pour d'autres clients, et aucun remboursement n'est prévu : le paiement se fait au magasin.`,
			confirmLabel: "Annuler la réservation",
			// `mutate` et non `mutateAsync` : la dialog attend `void`, et la
			// confirmation n'a rien à faire du retour. L'annulation est déjà partie
			// quand la dialog se ferme — les erreurs passent par `toast`.
			onConfirm: () => mutation.mutate(),
		});

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={askConfirmation}
			disabled={mutation.isPending}
		>
			<XCircle className="size-4" aria-hidden="true" />
			Annuler cette réservation
		</Button>
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
