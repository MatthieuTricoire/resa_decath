import { createFileRoute } from "@tanstack/react-router";
import { storeCanonicalPath } from "#/config/store";
import {
	getPublicActivities,
	getPublicActivityProducts,
} from "#/features/equipements/public-queries";
import { absoluteUrl } from "#/lib/seo";

/**
 * Sitemap XML générée à la volée côté serveur.
 *
 * Le catalogue vit en base : une PageList figée se désynchroniserait dès
 * qu'un produit est ajouté ou retiré de l'admin. La route réutilise les mêmes
 * fonctions serveur que les pages publiques, donc l'URL d'une activité ou
 * d'un produit n'apparaît ici que si elle répond vraiment.
 *
 * Route serveur pure (même modèle que `/api/auth/$`) : aucune donnée n'est
 * envoyée au navigateur, seulement du XML.
 *
 * Le chemin technique est `/api/sitemap` : le mapper de routes de TanStack
 * traduit un point en séparateur (`sitemap.xml.ts` donnerait `/sitemap/xml`),
 * donc le fichier ne peut pas épeler lui-même `/sitemap.xml`. En production,
 * Netlify réécrit `/sitemap.xml` vers cette route — voir `netlify.toml`.
 */
export const Route = createFileRoute("/api/sitemap")({
	server: {
		handlers: {
			GET: async () => {
				const today = new Date().toISOString().slice(0, 10);
				const urls: Array<{ loc: string; lastmod: string }> = [
					{
						loc: absoluteUrl(storeCanonicalPath),
						lastmod: today,
					},
				];

				const activities = await getPublicActivities();
				for (const activity of activities) {
					urls.push({
						loc: absoluteUrl(`/activite/${activity.slug}`),
						lastmod: today,
					});
					const products = await getPublicActivityProducts({
						data: activity.slug,
					});
					for (const product of products) {
						urls.push({
							loc: absoluteUrl(`/activite/${activity.slug}/${product.slug}`),
							lastmod: today,
						});
					}
				}

				const urlsXml = urls
					.map(
						({ loc, lastmod }) =>
							`  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
					)
					.join("\n");

				const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>`;

				return new Response(xml, {
					headers: {
						"content-type": "application/xml; charset=utf-8",
						// Une sitemap ne change qu'avec le catalogue : la laisser
						// vivre quelques heures évite de la régénérer à chaque accès.
						"cache-control": "public, max-age=3600",
					},
				});
			},
		},
	},
});

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
