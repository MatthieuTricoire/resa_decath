import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
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
	countRentalDays,
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
 * S'y ajoute la règle d'ouverture : le magasin est fermé le dimanche sauf
 * exception configurée, et l'on ne peut ni retirer ni rendre du matériel ce
 * jour-là. Une durée dont le retour tomberait un dimanche fermé est donc
 * grisée plutôt que proposée. Les jours situés **entre** le retrait et le retour
 * restent libres : du samedi au lundi reste la location du week-end, seul le
 * comptoir est fermé le dimanche.
 */
export function RentalWindowSelector({
	className,
	heading = "Dates de location",
	hint = "Ces dates s’appliquent à toute votre commande.",
}: {
	className?: string;
	heading?: string;
	hint?: string;
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
	const available = durations.data ?? [];
	const settings = schedule.data;
	// Tant que le catalogue ou les horaires n'ont pas répondu, aucune durée ne
	// peut être déclarée impossible : on ne griserait que des boutons sur la base
	// d'une information absente.
	const blockedDurations =
		pickupDate && settings
			? closedReturnDurations({
					pickupDate,
					durations: available,
					settings,
				})
			: [];
	// La même liste alimente les boutons grisés et l'encart qui les explique : les
	// deux ne peuvent pas diverger. Le libellé de l'encart reste propre au site ;
	// il faudrait le reformuler le jour où une durée y serait refusée pour une autre
	// raison qu'un jour de fermeture.
	const hasClosedDuration = blockedDurations.length > 0;
	// Le catalogue a pu évoluer depuis le choix : on le signale plutôt que de
	// laisser une durée non tarifable fantômer dans le récapitulatif.
	const isOffCatalog = durationDays > 0 && !available.includes(durationDays);

	/**
	 * Pose la fenêtre en garantissant un retour possible : la durée demandée est
	 * conservée si elle convient encore, sinon on se rabat sur la plus proche
	 * durée valide, pour ne jamais laisser une fenêtre impossible à rendre.
	 */
	const applyWindow = (nextPickup: string, requestedDuration: number) => {
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
	};

	const handleChange = (change: RentalWindowChange) => {
		// Sans date, on part d'aujourd'hui ; sans durée, on propose la plus courte
		// servie. Un changement de date conserve la durée en cours.
		applyWindow(
			change.pickupDate ?? todayInParis(),
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
				isPending={durations.isPending}
				onChange={handleChange}
			/>

			{hasClosedDuration && (
				<p className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--line)] bg-white/70 p-3 text-sm">
					<CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					{blockedDurations.length === 1
						? "Une durée se termine un dimanche, jour de fermeture du magasin : elle est grisée."
						: "Certaines durées se terminent un dimanche, jour de fermeture du magasin : elles sont grisées."}{" "}
					La location peut malgré tout couvrir un dimanche, seule la date de
					retour doit tomber un jour d’ouverture.
				</p>
			)}

			{isOffCatalog && (
				<p className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--line)] bg-white/70 p-3 text-sm">
					<CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					La durée de {rentalDurationLabel(durationDays)} n’est plus tarifée sur
					ce matériel. Choisissez une durée proposée ci-dessus.
				</p>
			)}
		</div>
	);
}
