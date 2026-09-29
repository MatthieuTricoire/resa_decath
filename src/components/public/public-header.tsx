import { Link } from "@tanstack/react-router";
import {
	CalendarDays,
	Menu,
	Mountain,
	ShoppingBasket,
	UserRound,
	X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { store, storeCanonicalPath } from "#/config/store";
import { formatRentalWindow, rentalDurationLabel } from "#/lib/dates";
import {
	cartDurationDays,
	cartItemCount,
	usePublicCart,
} from "#/stores/public-cart.store";

/** Navigation publique : activities, panier, contact magasin. */
export function PublicHeader({
	activities,
}: {
	activities: Array<{ slug: string; name: string }>;
}) {
	const [open, setOpen] = useState(false);
	const cartCount = usePublicCart(cartItemCount);
	// La fenêtre choisie vaut pour tout le panier : on la rappelle ici, sinon
	// chaque page fait croire au client qu'il peut la changer par article.
	const pickupDate = usePublicCart((state) => state.pickupDate);
	const returnDate = usePublicCart((state) => state.returnDate);
	const durationDays = usePublicCart(cartDurationDays);

	const links = [
		...activities.map((activity) => ({
			to: "/activite/$activitySlug",
			params: { activitySlug: activity.slug },
			label: activity.name,
		})),
	] as const;

	return (
		<header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--header-bg)] backdrop-blur">
			<div className="page-wrap flex h-16 items-center justify-between gap-4">
				<Link
					to={storeCanonicalPath}
					className="flex items-center gap-2 no-underline"
				>
					<Mountain
						className="size-5 text-primary dark:text-[#9aa7f5]"
						aria-hidden="true"
					/>
					<span className="display-title text-base font-semibold text-primary dark:text-[#9aa7f5]">
						{store.name}
					</span>
				</Link>

				<nav
					className="hidden items-center gap-7 lg:flex"
					aria-label="Navigation principale"
				>
					{links.map((link) => (
						<Link
							key={link.label}
							to={link.to}
							params={link.params}
							className="nav-link text-sm font-semibold no-underline"
							activeProps={{ className: "is-active" }}
							activeOptions={{ exact: link.to === storeCanonicalPath }}
						>
							{link.label}
						</Link>
					))}
				</nav>

				<div className="flex items-center gap-2">
					<Button
						asChild
						variant="outline"
						size="sm"
						// `sm:` désigne ici la classe Tailwind (≥640 px) : sur mobile on
						// monte la cible au-dessus des 40 px recommandés pour le pouce.
						className="relative h-10 sm:h-8"
					>
						<Link to="/panier" aria-label={`Panier (${cartCount})`}>
							<ShoppingBasket className="size-4" aria-hidden="true" />
							<span className="hidden sm:inline">Panier</span>
							{cartCount > 0 && (
								<span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[var(--sea-ink)] text-[11px] font-bold text-white">
									{cartCount}
								</span>
							)}
						</Link>
					</Button>

					<Button asChild variant="outline" size="sm" className="h-10 sm:h-8">
						{/* Toujours la même cible : `/mon-compte` affiche soit les
					    locations, soit l'invitation à se connecter. Évite un lien
					    différent selon qu'on sait ou non qui est connecté. */}
						<Link to="/mon-compte" aria-label="Mes locations">
							<UserRound className="size-4" aria-hidden="true" />
							<span className="hidden sm:inline">Mes locations</span>
						</Link>
					</Button>

					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-10 w-10 sm:size-9 lg:hidden"
						aria-expanded={open}
						aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
						onClick={() => setOpen((value) => !value)}
					>
						{open ? (
							<X className="size-5" aria-hidden="true" />
						) : (
							<Menu className="size-5" aria-hidden="true" />
						)}
					</Button>
				</div>
			</div>

			{durationDays > 0 && pickupDate && returnDate && (
				<p className="border-t border-[var(--line)] bg-[var(--sand)]/60 px-4 py-1.5 text-center text-xs font-medium text-[var(--sea-ink-soft)]">
					<CalendarDays
						className="mr-1.5 inline size-3.5 align-[-2px]"
						aria-hidden="true"
					/>
					Du {formatRentalWindow(pickupDate, returnDate)} ·{" "}
					{rentalDurationLabel(durationDays).toLowerCase()} ·{" "}
					<Link to="/panier" className="underline">
						modifier
					</Link>
				</p>
			)}

			{open && (
				<nav
					className="border-t border-[var(--line)] bg-white/90 lg:hidden"
					aria-label="Navigation mobile"
				>
					<div className="page-wrap flex flex-col py-2">
						{links.map((link) => (
							<Link
								key={link.label}
								to={link.to}
								params={link.params}
								className="border-b border-[var(--line)] py-3 text-sm font-semibold no-underline last:border-b-0"
								activeProps={{ className: "is-active" }}
								onClick={() => setOpen(false)}
							>
								{link.label}
							</Link>
						))}
						<Link
							to="/mon-compte"
							className="border-b border-[var(--line)] py-3 text-sm font-semibold no-underline"
							activeProps={{ className: "is-active" }}
							onClick={() => setOpen(false)}
						>
							Mes locations
						</Link>
						<a
							href={store.phoneHref}
							className="py-3 text-sm font-semibold no-underline last:border-b-0"
						>
							{store.phone}
						</a>
					</div>
				</nav>
			)}
		</header>
	);
}
