/**
 * Normalisation d'un libellé en slug d'URL (accents retirés, minuscules,
 * séparateurs réduits à un tiret). Source unique utilisée par l'admin,
 * le backfill et la génération de slugs côté serveur.
 */
export function slugify(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Slug garanti non vide : si le libellé ne contient que des symboles, on
 * retombe sur un suffixe lisible.
 */
export function slugifyOrFallback(value: string, fallback: string): string {
	const slug = slugify(value);
	return slug.length > 0 ? slug : slugify(fallback);
}

/**
 * Ajoute un suffixe numérique jusqu'à ce que le slug soit unique.
 * `isTaken` reçoit le slug candidat et répond vrai s'il est déjà utilisé.
 */
export function makeUniqueSlug(
	value: string,
	isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
	const base = slugify(value);
	const probe = base.length > 0 ? base : "produit";

	return (async () => {
		if (!(await isTaken(probe))) return probe;
		for (let suffix = 2; suffix < 1000; suffix += 1) {
			const candidate = `${probe}-${suffix}`;
			if (!(await isTaken(candidate))) return candidate;
		}
		return `${probe}-${Date.now().toString(36)}`;
	})();
}
