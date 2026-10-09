import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
	ArrowRight,
	CalendarDays,
	ChevronDown,
	MapPin,
	ShieldCheck,
} from "lucide-react";
import { Fragment } from "react";
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
import { queryKeys as durationQueryKeys } from "#/features/durees/query-keys";
import {
	getPublicActivities,
	getPublicRentalDurations,
	getPublicStoreSchedule,
} from "#/features/equipements/public-queries";
import {
	DEFAULT_STORE_HOURS,
	type StoreHours,
} from "#/features/store-hours/types";
import { PUBLIC_PAGE_CACHE_CONTROL } from "#/lib/cache-control";
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
		question: "Où et quand récupérer le matériel ?",
		answer: `Au comptoir location du magasin Decathlon Mountain à Laruns (Rue d'Aiga Bèra).
             Le retrait s'effectue dès l'ouverture le premier jour de votre réservation, et le retour avant la fermeture le dernier jour.`,
	},
	{
		question: "Comment régler ma location ?",
		answer: store.paymentNotice,
	},
	{
		question: "Quand et comment s'effectue le paiement ?",
		answer: `Le paiement se fait sur place lors du retrait de votre matériel.
Aucun règlement ni empreinte bancaire n'est demandé sur le site internet. Vous réglez directement en caisse (CB ou espèces).`,
	},
	{
		question: "Le matériel est-il disponible à mes dates ?",
		answer:
			"La disponibilité est calculée en direct : un produit ou une durée indisponible à vos dates est grisé avant la réservation, vous n'enregistrez donc jamais une commande pour rien.",
	},
	{
		question: "Que se passe-t-il en cas de mauvaise météo ou d'imprévu ?",
		answer:
			"Vous pouvez annuler ou modifier votre réservation sans aucun frais. Comme aucun paiement n'est prélevé en ligne, un simple e-mail ou coup de fil au magasin pour nous prévenir suffit afin de libérer le matériel pour d'autres pratiquants.",
	},
	{
		question: "Comment justifier ma réservation au comptoir ?",
		answer:
			"Présentez simplement l'e-mail de confirmation reçu (sur votre smartphone ou imprimé) ainsi que votre nom. Vous y retrouverez le récapitulatif de votre commande et votre code de réservation.",
	},
	{
		question: "Les équipements de sécurité sont-ils vérifiés ?",
		answer:
			"Oui, rigoureusement. Tous les équipements EPI (kits de via ferrata, casques, baudriers) ainsi que le matériel de bivouac sont contrôlés, inspectés et désinfectés entre chaque utilisation par notre équipe.",
	},
];

/** Accueil public : activities,_store URL canonique. */
export const Route = createFileRoute("/_public/location-materiel-{$ville}")({
	loader: async ({ context: { queryClient }, params }) => {
		if (params.ville !== store.citySlug) {
			throw notFound();
		}
		// Les trois lectures publiques partent ensemble : un seul aller-retour
		// serveur au lieu d'une chaîne. Les prefetch tolèrent un échec (le
		// composant re-fetch côté client), mais le sélecteur de dates a besoin de
		// ses durées dans le HTML initial, et `head` de celles des horaires :
		// `ensureQueryData` attend lui la valeur.
		await Promise.allSettled([
			queryClient.prefetchQuery({
				queryKey: ["public", "activities"],
				queryFn: () => getPublicActivities(),
			}),
			queryClient.prefetchQuery({
				queryKey: durationQueryKeys.publicDurations,
				queryFn: () => getPublicRentalDurations(),
			}),
		]);
		const { hours, openDays } = await queryClient.ensureQueryData({
			queryKey: ["public", "store-schedule"],
			queryFn: () => getPublicStoreSchedule(),
		});
		return { hours, openDays };
	},
	headers: () => ({ "Cache-Control": PUBLIC_PAGE_CACHE_CONTROL }),
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
				// horaires chargés, on publie la semaine de référence, qui est
				// aussi le seed et ce que l'admin verra par défaut.
				storeJsonLd(
					getStoreOpeningHoursSpecification(
						loaderData?.hours ?? DEFAULT_STORE_HOURS,
					),
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
	const activityList = activities.data?.activities ?? [];
	// Catégories masquées par la saison, groupées par saison de retour : la
	// copie rend « de retour cet été » / « de retour cet hiver ».
	const hiddenBySeason: { winter: string[]; summer: string[] } = {
		winter: [],
		summer: [],
	};
	for (const note of activities.data?.hidden ?? []) {
		hiddenBySeason[note.returnSeason].push(note.name);
	}
	const hiddenParts = [
		hiddenBySeason.winter.length > 0
			? `${hiddenBySeason.winter.join(", ")} de retour cet hiver`
			: "",
		hiddenBySeason.summer.length > 0
			? `${hiddenBySeason.summer.join(", ")} de retour cet été`
			: "",
	].filter(Boolean);
	// Le loader a déjà rempli le cache pour le sélecteur de dates : on relit la
	// même clé plutôt que d'en référencer une seconde fois le serveur.
	const { hours } = Route.useLoaderData();

	return (
		<>
			<section className="page-wrap rise-in grid gap-10 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
				<div className="space-y-6">
					<p className="island-kicker">Location de matériel de montagne</p>
					<h1 className="display-title text-4xl leading-tight font-semibold sm:text-5xl">
						Réservez votre matériel à {store.city}, partez plus vite en montagne
					</h1>
					<p className="max-w-xl text-lg text-(--sea-ink-soft)">
						Bloquez votre équipement en ligne en 2 minutes sans avance de frais.
						Votre commande est préparée à l'avance, réglez simplement sur place
						lors du retrait
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
								Choisir mon équipement
								<ArrowRight className="size-4" aria-hidden="true" />
							</a>
						</Button>
					</div>
				</div>
				<PracticalInfoCard hours={hours} className="hidden lg:block" />
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
							<p className="mt-2 text-sm text-(--sea-ink-soft)">
								Sélectionnez la date de retrait et la durée : l'ensemble de
								votre équipement sera préparé et réservé pour cette période.
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
					<p className="text-sm text-(--sea-ink-soft)">
						Sélectionnez vos dates ci-dessus pour afficher les disponibilités et
						tarifs en temps réel.
					</p>
				</div>

				<div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
					{activityList.map((activity) => {
						const copy = getActivityCopy(activity.slug, activity.name);
						return (
							<Link
								key={activity.slug}
								to="/activite/$activitySlug"
								params={{ activitySlug: activity.slug }}
								className="feature-card rise-in flex flex-col gap-3 rounded-2xl border border-(--line) p-6 no-underline"
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
								<p className="text-sm text-(--sea-ink-soft)">
									{activity.description || copy.card}
								</p>
								<span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold">
									Voir le matériel
									<ArrowRight className="size-4" aria-hidden="true" />
								</span>
							</Link>
						);
					})}
				</div>

				{hiddenParts.length > 0 && (
					<div className="mt-6 flex items-start gap-2 rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm text-[var(--sea-ink-soft)]">
						<CalendarDays
							className="mt-0.5 size-4 shrink-0"
							aria-hidden="true"
						/>
						<p className="font-semibold">
							{hiddenParts.map((part, index) => (
								<Fragment key={part}>
									{index > 0 ? " · " : null}
									{part}
								</Fragment>
							))}
						</p>
					</div>
				)}
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
								title: "Choisissez vos dates & votre matériel",
								body: "Indiquez vos dates de sortie et sélectionnez vos équipements : les disponibilités s'affichent en temps réel.",
							},
							{
								step: "2",
								title: "Réservez sans avance de frais",
								body: "Validez votre commande en 1 clic. Aucune carte bancaire requise en ligne, votre matériel est immédiatement mis de côté.",
							},
							{
								step: "3",
								title: "Retirez et réglez en magasin",
								body: "Venez au comptoir location à Laruns avec votre confirmation, réglez sur place et filez profiter de la montagne.",
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
										className="size-5 shrink-0 text-(--sea-ink-soft) transition-transform group-open:rotate-180"
										aria-hidden="true"
									/>
								</summary>
								<p className="mt-3 text-sm text-(--sea-ink-soft)">{answer}</p>
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
				<PracticalInfoCard hours={hours} />
			</section>
		</>
	);
}

/** Carte « Informations pratiques » : adresse, horaires, contrôle du matériel. */
function PracticalInfoCard({
	hours,
	className,
}: {
	hours: StoreHours;
	className?: string;
}) {
	return (
		<aside className={cn("island-shell rounded-2xl p-6", className)}>
			<h2 className="island-kicker">Informations pratiques</h2>
			<div className="mt-4 space-y-4 text-sm">
				<div className="flex gap-3">
					<MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<dl>
						<dt className="font-semibold">Adresse</dt>
						<dd className="text-(--sea-ink-soft)">{store.fullAddress}</dd>
					</dl>
				</div>
				<div className="flex gap-3">
					<CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<dl>
						<dt className="font-semibold">Horaires</dt>
						{/* Une liste de définitions plutôt qu'un tableau : il n'y a pas
							    d'en-tête de colonne, seulement des paires jour / horaires.
							    Un tableau ferait annoncer aux lecteurs d'écran une grille de
							    données qui n'existe pas. */}
						<dd className="mt-1 text-(--sea-ink-soft)">
							<dl className="space-y-1">
								{storeOpeningHoursText(hours).map((day) => (
									<div
										key={day.day}
										className="flex justify-between gap-4 sm:justify-start sm:gap-3"
									>
										<dt className="w-24 shrink-0 font-medium">{day.day}</dt>
										<dd>{day.hours}</dd>
									</div>
								))}
							</dl>
						</dd>
					</dl>
				</div>
				<div className="flex gap-3">
					<ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<dl>
						<dt className="font-semibold">Matériel vérifié & certifié</dt>
						<dd className="text-(--sea-ink-soft)">
							Tous les équipements sont inspectés et vérifiés avant chaque
							départ.
						</dd>
					</dl>
				</div>
			</div>
		</aside>
	);
}
