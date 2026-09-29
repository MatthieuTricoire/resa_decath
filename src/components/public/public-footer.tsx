import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MapPin, Phone } from "lucide-react";
import { store, storeCanonicalPath } from "#/config/store";
import { getPublicStoreSchedule } from "#/features/equipements/public-queries";

/** Pied de page public : NAP, horaires, mention paiement et lien équipe. */
export function PublicFooter() {
	const year = new Date().getFullYear();
	const schedule = useQuery({
		queryKey: ["public", "store-schedule"],
		queryFn: () => getPublicStoreSchedule(),
		staleTime: 5 * 60 * 1000,
	});

	return (
		<footer className="site-footer mt-20">
			<div className="page-wrap grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
				<div className="space-y-3">
					<p className="display-title text-lg font-semibold text-[var(--primary)] dark:text-[#9aa7f5]">
						{store.name}
					</p>
					<p className="text-sm text-[var(--sea-ink-soft)]">
						Location de matériel de montagne à {store.city}.
					</p>
					<Link
						to={storeCanonicalPath}
						className="text-sm font-semibold no-underline"
					>
						Voir le catalogue
					</Link>
				</div>

				<div className="space-y-3 text-sm">
					<p className="island-kicker">Adresse</p>
					<address className="not-italic text-[var(--sea-ink-soft)]">
						{store.address}
						<br />
						{store.postalCode} {store.city}
					</address>
					<a
						href="https://www.google.com/maps/search/?api=1&query=Decathlon+Mountain+Laruns"
						target="_blank"
						rel="noreferrer noopener"
						className="inline-flex items-center gap-1.5 text-sm no-underline"
					>
						<MapPin className="size-3.5" aria-hidden="true" />
						Itinéraire
					</a>
				</div>

				<div className="space-y-3 text-sm">
					<p className="island-kicker">Téléphone</p>
					<a
						href={store.phoneHref}
						className="inline-flex items-center gap-1.5 no-underline"
					>
						<Phone className="size-3.5" aria-hidden="true" />
						{store.phone}
					</a>
					<p className="text-[var(--sea-ink-soft)]">
						Retrait {store.pickupWindow}, retour {store.returnWindow}.
					</p>
				</div>

				<div className="space-y-3 text-sm">
					<p className="island-kicker">Horaires</p>
					<ul className="space-y-1 text-[var(--sea-ink-soft)]">
						<li>Lundi – samedi : 9h – 19h</li>
						{/* Le dimanche est la seule ouverture variable : la lire plutôt que
						    l'écrire, sinon le pied de page ment dès que l'admin ouvre les
						    dimanches. La donnée est préchargée par la layout publique, donc
						    déjà dans le HTML initial. */}
						<li>
							Dimanche : {schedule.data?.sundayOpen ? "9h – 19h" : "fermé"}
						</li>
					</ul>
					<p className="text-[var(--sea-ink-soft)]">{store.paymentNotice}</p>
				</div>
			</div>

			<div className="border-t border-[var(--line)]">
				<div className="page-wrap flex flex-col gap-2 py-5 text-xs text-[var(--sea-ink-soft)] sm:flex-row sm:items-center sm:justify-between">
					<p>
						© {year} {store.name}. Tous droits réservés.
					</p>
					<Link to="/admin" className="no-underline">
						Espace équipe
					</Link>
				</div>
			</div>
		</footer>
	);
}
