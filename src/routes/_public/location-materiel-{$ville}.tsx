import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
	ArrowRight,
	CalendarDays,
	ChevronDown,
	MapPin,
	ShieldCheck,
} from "lucide-react";
import { RentalWindowSelector } from "#/components/public/rental-window-selector";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { getActivityCopy } from "#/config/activities";
import {
	getStoreOpeningHoursSpecification,
	store,
	storeCanonicalPath,
	storeOpeningHoursText,
} from "#/config/store";
import {
	getPublicActivities,
	getPublicRentalDurations,
	getPublicStoreSchedule,
} from "#/features/equipements/public-queries";
import {
	buildPageHead,
	type FaqEntry,
	faqPageJsonLd,
	storeJsonLd,
} from "#/lib/seo";
import { cn } from "#/lib/utils";

/**
 * Questions fréquentes de l'accueil. Puisées uniquement dans ce que le site
 * fait vraiment (retrait en magasin, paiement au comptoir, codes par email,
 * disponibilité en direct) : pas d'engagement que la rue ne tiendrait pas. La
 * même liste alimente la section visible et le JSON-LD `FAQPage`, donc le
 * contenu exploré par Google est celui qu'un visiteur lit.
 */
const HOME_FAQ: FaqEntry[] = [
	{
		question: "Où récupérer et rendre le matériel ?",
		answer: `Tout se passe au comptoir location de ${store.name}, ${store.fullAddress}. Retrait ${store.pickupWindow}, retour ${store.returnWindow}, du lundi au samedi (dimanche selon la saison).`,
	},
	{
		question: "Comment régler ma location ?",
		answer: store.paymentNotice,
	},
	{
		question: "Comment récupérer mes codes de retrait ?",
		answer:
			"À la réservation vous recevez un email de confirmation. Vous retrouvez vos codes à tout moment dans l'espace « Mes locations », joignable par un lien envoyé sur votre adresse email.",
	},
	{
		question: "Le matériel est-il disponible à mes dates ?",
		answer:
			"La disponibilité est calculée en direct : un produit ou une durée indisponible à vos dates est grisé avant la réservation, vous n'enregistrez donc jamais une commande pour rien.",
	},
];

/** Accueil public : activities,_store URL canonique. */
export const Route = createFileRoute("/_public/location-materiel-{$ville}")({
	loader: async ({ context: { queryClient }, params }) => {
		if (params.ville !== store.citySlug) {
			throw notFound();
		}
		void queryClient.prefetchQuery({
			queryKey: ["public", "activities"],
			queryFn: () => getPublicActivities(),
		});
		// Le sélecteur de dates est en haut de page : ses durées doivent être
		// dans le HTML initial, pas seulement après hydratation.
		void queryClient.prefetchQuery({
			queryKey: ["public", "rental-durations"],
			queryFn: () => getPublicRentalDurations(),
		});
		// `head` a besoin de la valeur pour le JSON-LD, et le composant pour les
		// horaires affichés : `ensureQueryData` remplit le cache et rend la donnée,
		// là où `prefetchQuery` ne renverrait rien.
		const { sundayOpen } = await queryClient.ensureQueryData({
			queryKey: ["public", "store-schedule"],
			queryFn: () => getPublicStoreSchedule(),
		});
		return { sundayOpen };
	},
	head: ({ loaderData }) =>
		buildPageHead({
			meta: {
				title: store.defaultTitle,
				description: store.defaultDescription,
				canonicalPath: storeCanonicalPath,
				noIndex: false,
			},
			jsonLd: [
				// `head` peut s'exécuter avant le loader sur un `notFound` : sans
				// horaire chargé, le magasin est ouvert du lundi au samedi, comme
				// le décrit sa configuration.
				storeJsonLd(
					getStoreOpeningHoursSpecification(!!loaderData?.sundayOpen),
				),
				faqPageJsonLd(HOME_FAQ),
			],
		}),
	component: HomePage,
});

function HomePage() {
	const activities = useQuery({
		queryKey: ["public", "activities"],
		queryFn: () => getPublicActivities(),
	});
	// Le loader a déjà rempli le cache pour le sélecteur de dates : on relit la
	// même clé plutôt que d'en référencer une seconde fois le serveur.
	const { sundayOpen } = Route.useLoaderData();

	return (
		<>
			<section className="page-wrap rise-in grid gap-10 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
				<div className="space-y-6">
					<p className="island-kicker">Location de matériel de montagne</p>
					<h1 className="display-title text-4xl leading-tight font-semibold sm:text-5xl">
						Réservez votre matériel à {store.city}, sans passer par la caisse
					</h1>
					<p className="max-w-xl text-lg text-(--sea-ink-soft)">
						Escalade, randonnée, bivouac et via ferrata : choisissez vos dates,
						réservez en ligne et retirez votre équipement au comptoir location.
					</p>
					<div className="flex flex-wrap items-center gap-3">
						<Button asChild size="lg" variant="outline">
							<a href={store.phoneHref}>Appeler le magasin</a>
						</Button>
						<Button asChild size="lg">
							{/* Ancre vers la première étape du parcours : les dates. Sur
							    mobile c'est l'action utile, le panier reste à portée via
							    l'icône du header. */}
							<a href="#etape-1">
								Louer du matériel
								<ArrowRight className="size-4" aria-hidden="true" />
							</a>
						</Button>
					</div>
					<p className="text-sm text-(--sea-ink-soft)">{store.paymentNotice}</p>
				</div>

				<PracticalInfoCard
					sundayOpen={sundayOpen}
					className="hidden lg:block"
				/>
			</section>

			{/* Étape 1 : cible du CTA « Louer du matériel ». Le décalage de scroll
			    compense le header sticky et son éventuel bandeau de dates. */}
			<section id="etape-1" className="page-wrap scroll-mt-28 pb-10">
				<div className="island-shell rounded-2xl p-6 sm:p-8">
					<div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
						<div>
							<p className="island-kicker">Étape 1</p>
							<h2 className="display-title text-2xl font-semibold">
								Choisissez vos dates
							</h2>
							<p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
								Une seule fenêtre pour toute votre commande : le matériel est
								retenu au comptoir le jour du retrait et rendu le jour du
								retour.
							</p>
						</div>
						<RentalWindowSelector />
					</div>
				</div>
			</section>

			<section className="page-wrap py-10">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<p className="island-kicker">Nos activités</p>
						<h2 className="display-title text-3xl font-semibold">
							Choisissez votre pratique
						</h2>
					</div>
					<p className="text-sm text-[var(--sea-ink-soft)]">
						Tarifs et disponibilités dépendent des dates choisies.
					</p>
				</div>

				<div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
					{(activities.data ?? []).map((activity) => {
						const copy = getActivityCopy(activity.slug, activity.name);
						return (
							<Link
								key={activity.slug}
								to="/activite/$activitySlug"
								params={{ activitySlug: activity.slug }}
								className="feature-card rise-in flex flex-col gap-3 rounded-2xl border border-[var(--line)] p-6 no-underline"
							>
								<div className="flex items-start justify-between gap-2">
									<h3 className="display-title text-xl font-semibold">
										{activity.name}
									</h3>
									<Badge variant="secondary">
										{activity.itemCount} article
										{activity.itemCount > 1 ? "s" : ""}
									</Badge>
								</div>
								<p className="text-sm text-[var(--sea-ink-soft)]">
									{copy.card}
								</p>
								<span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold">
									Voir le matériel
									<ArrowRight className="size-4" aria-hidden="true" />
								</span>
							</Link>
						);
					})}
				</div>
			</section>

			<section className="page-wrap py-10">
				<div className="island-shell rounded-2xl p-6 sm:p-8">
					<h2 className="display-title text-2xl font-semibold">
						Comment ça se passe ?
					</h2>
					<ol className="mt-6 grid gap-6 sm:grid-cols-3">
						{[
							{
								step: "1",
								title: "Choisissez vos dates",
								body: "La disponibilité est calculée en direct pour chaque durée proposée.",
							},
							{
								step: "2",
								title: "Réservez en ligne",
								body: "Paiement au magasin : aucun débit en ligne, aucune donnée bancaire demandée.",
							},
							{
								step: "3",
								title: "Retirez au comptoir",
								body: `Présentez votre confirmation, retirez ${store.pickupWindow} et rapportez le matériel ${store.returnWindow}.`,
							},
						].map((item) => (
							<li key={item.step} className="space-y-2">
								<span className="island-kicker">Étape {item.step}</span>
								<p className="font-semibold">{item.title}</p>
								<p className="text-sm text-[var(--sea-ink-soft)]">
									{item.body}
								</p>
							</li>
						))}
					</ol>
				</div>
			</section>

			<section className="page-wrap py-10">
				<div className="mx-auto max-w-3xl">
					<div className="text-center">
						<p className="island-kicker">Questions fréquentes</p>
						<h2 className="display-title text-3xl font-semibold">
							Vous hésitez encore ?
						</h2>
					</div>
					<div className="mt-8 space-y-3">
						{HOME_FAQ.map(({ question, answer }) => (
							<details
								key={question}
								className="island-shell group rounded-2xl p-5"
							>
								<summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold select-none [&::-webkit-details-marker]:hidden">
									{question}
									<ChevronDown
										className="size-5 shrink-0 text-[var(--sea-ink-soft)] transition-transform group-open:rotate-180"
										aria-hidden="true"
									/>
								</summary>
								<p className="mt-3 text-sm text-[var(--sea-ink-soft)]">
									{answer}
								</p>
							</details>
						))}
					</div>
				</div>
			</section>

			{/* Sur mobile les infos pratiques n'ont pas leur place dans le hero :
			    elles y pousseraient l'étape 1 sous la ligne de flottaison. Elles
			    ferment donc la page, après la FAQ. Sur grand écran la copie du
			    hero reste visible (`hidden lg:block`), l'une des deux étant
			    toujours hors de l'arbre d'accessibilité. */}
			<section className="page-wrap py-10 lg:hidden">
				<PracticalInfoCard sundayOpen={sundayOpen} />
			</section>
		</>
	);
}

/** Carte « Informations pratiques » : adresse, horaires, contrôle du matériel. */
function PracticalInfoCard({
	sundayOpen,
	className,
}: {
	sundayOpen: boolean;
	className?: string;
}) {
	return (
		<aside className={cn("island-shell rounded-2xl p-6", className)}>
			<h2 className="island-kicker">Informations pratiques</h2>
			<dl className="mt-4 space-y-4 text-sm">
				<div className="flex gap-3">
					<MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<div>
						<dt className="font-semibold">Adresse</dt>
						<dd className="text-[var(--sea-ink-soft)]">{store.fullAddress}</dd>
					</div>
				</div>
				<div className="flex gap-3">
					<CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<div>
						<dt className="font-semibold">Horaires</dt>
						<dd className="text-[var(--sea-ink-soft)]">
							{storeOpeningHoursText(sundayOpen)}
						</dd>
					</div>
				</div>
				<div className="flex gap-3">
					<ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<div>
						<dt className="font-semibold">Matériel contrôlé</dt>
						<dd className="text-[var(--sea-ink-soft)]">
							Les équipements de sécurité sont vérifiés avant chaque location.
						</dd>
					</div>
				</div>
			</dl>
		</aside>
	);
}
