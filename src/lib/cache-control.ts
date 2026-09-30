/**
 * Cache HTTP des pages du catalogue public, appliqué à la réponse SSR via
 * `route.options.headers`.
 *
 * Le catalogue n'est pas personnalisé (pas de session derrière ces pages) :
 * les CDN / reverse-proxy peuvent donc servir le HTML 60 s (s-maxage), tout en
 * resservant une version périmée le temps de régénérer (stale-while-revalidate).
 * Les pages avec session (panier, connexion, mon compte, réservation) ou les
 * endpoints de devis ne portent volontairement aucun cache.
 */
export const PUBLIC_PAGE_CACHE_CONTROL =
	"public, max-age=0, s-maxage=60, stale-while-revalidate=300";
