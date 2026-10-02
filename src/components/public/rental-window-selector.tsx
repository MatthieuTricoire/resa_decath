import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Clock, Info } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import {
	type RentalWindowChange,
	RentalWindowField,
} from "#/components/forms/rental-window-field";
import {
	getPublicRentalDurations,
	getPublicStoreSchedule,
} from "#/features/equipements/public-queries";
import {
	closedReturnDurations,
	resolveDuration,
} from "#/features/reservations/opening-days";
import {
	type ProductDurationSupport,
	unpricedDurations,
} from "#/features/reservations/pricing";
import {
	countRentalDays,
	DEFAULT_LAST_SAME_DAY_PICKUP_HOUR,
	earliestPickupDateInParis,
	rentalDurationLabel,
	todayInParis,
} from "#/lib/dates";
import { setPublicCartWindow, usePublicCart } from "#/stores/public-cart.store";

/**
 * Sélecteur de la fenêtre de location côté client : une date de départ, puis une
 * durée. Le rendu est délégué à `RentalWindowField`, partagé avec la caisse.
 *
 * Ce composant ne garde que ce qui lui est propre : les données, le store du
 * panier, le repli sur une durée servie, et les deux encarts d'explication.
 *
 * Les durées proposées sont celles que l'admin a réellement tarifées
 * (`getPublicRentalDurations`) : choisir « 3 jours » ne peut donc pas produire
 * une commande qu'aucun prix ne couvre. Le retour est calculé à partir de la
 * durée, une commande n'ayant qu'une seule période.
 *
 * S'y ajoute la règle d'ouverture : les jours ouverts sont ceux que l'admin a
 * paramétrés (le dimanche est fermé hors forte saison, mais ce n'est plus le seul
 * jour variable), et l'on ne peut ni retirer ni rendre du matériel un jour fermé.
 * Une durée dont le retour tomberait un jour fermé est donc grisée plutôt que
 * proposée. Les jours situés **entre** le retrait et le retour restent libres : du
 * samedi au lundi reste la location du week-end, seul le comptoir est fermé le
 * dimanche.
 *
 * Sur une fiche produit, `durationSupport` ajoute un second motif de refus : les
 * durées que ce matériel ne vend pas. Les durées du catalogue restent affichées —
 * le client y voit ce qu'il pourrait commander ailleurs, plutôt qu'une liste
 * amputée — mais elles sont grisées, avec la raison au survol. Ce contexte sert
 * aussi de signal : la remarque qui explique ces boutons n'est rendue que là, via
 * l'emplacement `durationNote` du champ, entre les durées et la date de retour.
 */
export function RentalWindowSelector({
	className,
	heading = "Dates de location",
	hint = "Période valable pour l'ensemble des articles sélectionnés.",
	durationSupport,
}: {
	className?: string;
	heading?: string;
	hint?: string;
	/**
	 * Ce que le matériel affiché sait facturer. Absent quand la page n'a pas
	 * d'article en tête (accueil, panier) : seules les règles calendaires
	 * s'appliquent alors.
	 */
	durationSupport?: ProductDurationSupport;
}) {
	const pickupDate = usePublicCart((state) => state.pickupDate);
	const returnDate = usePublicCart((state) => state.returnDate);
	const durations = useQuery({
		queryKey: ["public", "rental-durations"],
		queryFn: () => getPublicRentalDurations(),
		staleTime: 5 * 60 * 1000,
	});
	const schedule = useQuery({
		queryKey: ["public", "store-schedule"],
		queryFn: () => getPublicStoreSchedule(),
		staleTime: 5 * 60 * 1000,
	});

	const durationDays =
		pickupDate && returnDate ? countRentalDays(pickupDate, returnDate) : 0;
	// Date de retrait la plus proche : aujourd'hui avant la coupure, sinon demain.
	// Elle borne le calendrier, sert de repli quand aucune date n'est choisie, et
	// évite de repartir sur une fenêtre du jour même une fois la coupure passée.
	// Tant que les horaires n'ont pas répondu, on garde la valeur par défaut : une
	// borne trop haute laisserait choisir une date que le serveur refusera, une
	// borne trop basse ferait inutilement disparaître aujourd'hui du calendrier.
	const earliestPickupDate = earliestPickupDateInParis(
		schedule.data?.lastSameDayPickupHour ?? DEFAULT_LAST_SAME_DAY_PICKUP_HOUR,
	);
	// La coupure du jour même est dépassée : on prévient que la location ne
	// démarre plus aujourd'hui.
	const sameDayCutoffPassed = earliestPickupDate > todayInParis();
	const available = useMemo(() => durations.data ?? [], [durations.data]);
	const settings = schedule.data;
	// Tant que le catalogue ou les horaires n'ont pas répondu, aucune durée ne
	// peut être déclarée impossible : on ne griserait que des boutons sur la base
	// d'une information absente.
	//
	// Le refus calendaire dépend de la date de retrait et des horaires ; le refus
	// tarifaire, non : une durée que le matériel ne vend pas est refusée quelle que
	// soit la date, et le sait dès que la fiche est chargée.
	const { closed, unpriced, blockedDurations } = useMemo(() => {
		const closedBlocks =
			pickupDate && settings
				? closedReturnDurations({ pickupDate, durations: available, settings })
				: [];
		const unpricedBlocks = durationSupport
			? unpricedDurations({
					durations: available,
					support: durationSupport,
					// La fermeture primant : une durée déjà refusée pour elle garde
					// cette raison, la plus concrète pour le client.
					alreadyBlocked: closedBlocks.map((block) => block.duration),
				})
			: [];
		return {
			closed: closedBlocks,
			unpriced: unpricedBlocks,
			// La même liste alimente les boutons grisés et l'encart qui les explique :
			// les deux ne peuvent pas diverger.
			blockedDurations: [...closedBlocks, ...unpricedBlocks],
		};
	}, [available, durationSupport, pickupDate, settings]);
	const hasClosedDuration = closed.length > 0;
	const hasUnpricedDuration = unpriced.length > 0;
	// Le libellé de l'encart est déduit des refus réellement affichés : un texte
	// qui n'annoncerait que la fermeture mentirait dès qu'une durée est refusée
	// pour un motif tarifaire.
	const blockedMessage = hasClosedDuration
		? hasUnpricedDuration
			? "Certaines durées sont désactivées : la date de retour coïncide avec un jour de fermeture, ou ce matériel n’est pas louable sur cette durée."
			: "Certaines durées sont désactivées car la date de retour coïncide avec un jour de fermeture."
		: "Certaines durées sont désactivées : ce matériel n’est pas louable sur ces durées-là.";
	// L'encart n'a de sens que là où **un** matériel est en jeu : ailleurs la
	// fenêtre vaut pour toute la commande, et le panier énumère lui-même ce qui
	// bloque chaque ligne — un motif général y serait à la fois imprécis et
	// redondant. `durationSupport` est exactement le signal « fiche produit ».
	//
	// Pas de marge propre : rendu dans la grille du champ, l'espacement vient
	// d'elle, sinon la remarque se retrouverait à deux crans des boutons.
	const durationNote =
		durationSupport && (hasClosedDuration || hasUnpricedDuration) ? (
			<div className="flex items-start gap-2.5 rounded-lg border border-amber-200/60 bg-amber-50/40 p-2.5 text-xs text-amber-900">
				<Info
					className="mt-0.5 size-4 shrink-0 text-amber-600"
					aria-hidden="true"
				/>
				<p>{blockedMessage}</p>
			</div>
		) : null;
	// Le catalogue a pu évoluer depuis le choix : on le signale plutôt que de
	// laisser une durée non tarifable fantômer dans le récapitulatif.
	const isOffCatalog = durationDays > 0 && !available.includes(durationDays);

	/**
	 * Pose la fenêtre en garantissant un retour possible : la durée demandée est
	 * conservée si elle convient encore, sinon on se rabat sur la plus proche
	 * durée valide, pour ne jamais laisser une fenêtre impossible à rendre.
	 */
	const applyWindow = useCallback(
		(nextPickup: string, requestedDuration: number) => {
			if (!settings || available.length === 0) {
				setPublicCartWindow({
					pickupDate: nextPickup,
					durationDays: requestedDuration,
				});
				return;
			}
			const duration =
				resolveDuration({
					pickupDate: nextPickup,
					requestedDuration,
					durations: available,
					settings,
				}) ?? 0;
			setPublicCartWindow({ pickupDate: nextPickup, durationDays: duration });
		},
		[settings, available],
	);

	// Une fenêtre encore posée sur le jour même une fois la coupure passée —
	// choisie le matin, ou restaurée avant 15h — repart de la date la plus
	// proche autorisée, pour ne jamais laisser le calendrier revendiquer un
	// retrait que le serveur refuserait.
	useEffect(() => {
		if (pickupDate && pickupDate < earliestPickupDate) {
			applyWindow(earliestPickupDate, durationDays);
		}
	}, [pickupDate, durationDays, earliestPickupDate, applyWindow]);

	const handleChange = (change: RentalWindowChange) => {
		// Sans date, on part de la date la plus proche servie (aujourd'hui avant
		// 15h, sinon demain) ; sans durée, on propose la plus courte servie. Un
		// changement de date conserve la durée en cours.
		applyWindow(
			change.pickupDate ?? earliestPickupDate,
			change.durationDays ?? available[0] ?? 1,
		);
	};

	return (
		<div className={className}>
			<RentalWindowField
				heading={heading}
				hint={hint}
				pickupDate={pickupDate}
				returnDate={returnDate}
				durations={available}
				settings={settings}
				blockedDurations={blockedDurations}
				durationNote={durationNote}
				isPending={durations.isPending}
				minDateKey={earliestPickupDate}
				onChange={handleChange}
			/>

			{/* 1. Règle horaire même jour : Informatif neutre */}
			{sameDayCutoffPassed && (
				<div className="mt-3 flex items-center gap-2.5 rounded-lg bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
					<Clock
						className="size-4 shrink-0 text-slate-400"
						aria-hidden="true"
					/>
					<span>
						Retraits le jour même jusqu'à{" "}
						{String(
							schedule.data?.lastSameDayPickupHour ??
								DEFAULT_LAST_SAME_DAY_PICKUP_HOUR,
						).padStart(2, "0")}
						h. Premier créneau disponible dès demain.
					</span>
				</div>
			)}

			{/* 2. Hors catalogue : Cas d'état non supporté. Contrairement à la
			    remarque sur les durées, cet encart reste sous le champ : il
			    concerne la fenêtre entière, pas les seuls boutons de durée. */}
			{isOffCatalog && (
				<div className="mt-2.5 flex items-start gap-2.5 rounded-lg border border-orange-200/70 bg-orange-50/50 p-2.5 text-xs text-orange-800">
					<AlertCircle
						className="mt-0.5 size-4 shrink-0 text-orange-600"
						aria-hidden="true"
					/>
					<p>
						La durée de {rentalDurationLabel(durationDays)} n’est pas disponible
						pour ce matériel.
					</p>
				</div>
			)}
		</div>
	);
}
