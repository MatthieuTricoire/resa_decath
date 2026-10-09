/**
 * Textes éditoriaux des pages d'activité. Le catalogue (nom, slug, nombre de
 * produits) vient de la base ; seules les accroches SEO sont éditoriales, avec
 * un repli automatique pour toute activité ajoutée depuis l'admin.
 */

export type ActivityCopy = {
	title: string;
	/** Accroche courte, affichée sous le titre. */
	lead: string;
	/** Paragraphe de la page, utilisé pour le contenu et le SEO. */
	body: string;
	/** Phrase d'accroche pour la carte d'activité de l'accueil. */
	card: string;
};

export const activityCopies: Record<string, ActivityCopy> = {
	"escalade-bloc": {
		title: "Location d’escalade et de bloc à Laruns",
		lead: "Baudriers, casques, crash pads et mousquetons pour la reprise.",
		body: "Idéal pour la falaise et les sites de grimpe autour de Laruns. Les baudriers et les casques sont contrôlés avant chaque location, et le crash pad vous accompagne aussi bien en salle qu’en extérieur. Réservez en ligne et retirez votre matériel au comptoir.",
		card: "Baudriers, casques et crash pads contrôlés avant chaque location.",
	},
	randonnee: {
		title: "Location de matériel de randonnée à Laruns",
		lead: "Sacs à dos, bâtons et gourdes filtrantes pour partir en montagne.",
		body: "Des vallées aux sommets du Pays Oloronais, choisissez le sac à dos Quechua MH500, les bâtons de marche Forclaz et une gourde filtrante pour une sortie sereine. Retrait au comptoir location et paiement en magasin.",
		card: "Sacs à dos, bâtons et gourdes filtrantes pour partir en randonnée.",
	},
	bivouac: {
		title: "Location de matériel de bivouac à Laruns",
		lead: "Tentes, sacs de couchage et matelas pour une nuit en altitude.",
		body: "Pour un bivouac sur les plateaux ou en forêt, la tente Quechua 2 Secondes et le sac de couchage Forclaz MT100 garantissent une nuit sèche. Nos conseillers vous donnent les bons conseils de pose au comptoir.",
		card: "Tentes et sacs de couchage pour dormir en altitude.",
	},
	"via-ferrata": {
		title: "Location de via ferrata à Laruns",
		lead: "Kits complets, casques et gants pour progresser en sécurité.",
		body: "Le kit via ferrata Simond Vertige, le casque Simond Cliff et les gants dédiés forment un équipement complet et normé. La réservation en ligne est recommandée le week-end et pendant la haute saison.",
		card: "Kits complets, casques et gants pour progresser en sécurité.",
	},
};

/** Copie d'une activité, avec repli sur son nom de catalogue. */
export function getActivityCopy(
	slug: string,
	fallbackName: string,
): ActivityCopy {
	const name = fallbackName.toLowerCase();
	return (
		activityCopies[slug] ?? {
			title: `Location de matériel ${name} à Laruns`,
			lead: `Location de matériel ${name} au magasin de Laruns.`,
			body: `Retrouvez tout le matériel ${name} disponible à la location à Decathlon Mountain Laruns, avec retrait et paiement en magasin.`,
			card: `Matériel ${name} disponible à la location.`,
		}
	);
}
