/** Ancre du sélecteur de dates, partagée par la fiche produit et le panier. */
export const DATES_ANCHOR_ID = "choisir-dates";

/** Fait défiler jusqu'au sélecteur de dates, sans animation si l'utilisateur la refuse. */
export function scrollToDates(): void {
	const target = document.getElementById(DATES_ANCHOR_ID);
	if (!target) return;
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	target.scrollIntoView({
		behavior: reduce ? "auto" : "smooth",
		block: "start",
	});
}
