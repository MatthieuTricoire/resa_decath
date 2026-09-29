/**
 * Rapport de readiness du catalogue pour la vente en ligne.
 *
 * Une variante n'est réservable en ligne que si elle possède au moins une
 * `price_options` active : c'est cette option qui porte le prix affiché et le
 * code-barres reconnu par la caisse. Le rapport liste donc ce qui manque.
 *
 * Usage : npm run db:audit:public
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"] });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("DATABASE_URL is not defined in environment variables");
}

const sql = postgres(databaseUrl, { max: 1 });

type AuditRow = {
	category: string;
	category_slug: string;
	item: string;
	item_slug: string;
	variant: string;
	sku: string | null;
	stock: number;
	option_count: number;
	active_options: number;
};

type DurationRow = { label: string; days: number; sort_order: number };

async function main() {
	const durations = await sql<DurationRow[]>`
		SELECT "label", "days", "sort_order"
		FROM "rental_durations"
		ORDER BY "sort_order", "days"
	`;

	console.log("Durées de location définies en admin :");
	if (durations.length === 0) {
		console.log("  (aucune)");
	} else {
		for (const duration of durations) {
			console.log(`  - ${duration.label} (${duration.days} j)`);
		}
	}

	const rows = await sql<AuditRow[]>`
		SELECT
			c."name"        AS category,
			c."slug"        AS category_slug,
			i."name"        AS item,
			i."slug"        AS item_slug,
			v."decathlon_sku" AS sku,
			v."total_stock" AS stock,
			COUNT(p."id")::int                AS option_count,
			COUNT(p."id") FILTER (WHERE p."is_active")::int AS active_options
		FROM "item_variants" v
		INNER JOIN "items" i ON i."id" = v."item_id"
		INNER JOIN "categories" c ON c."id" = i."category_id"
		LEFT JOIN "price_options" p ON p."variant_id" = v."id"
		GROUP BY c."name", c."slug", i."name", i."slug", v."id"
		ORDER BY c."name", i."name", v."decathlon_sku" NULLS LAST
	`;

	const bookable = rows.filter((row) => row.active_options > 0);
	const blocked = rows.filter((row) => row.active_options === 0);

	console.log(
		`\nVariantes : ${rows.length} | réservables en ligne : ${bookable.length} | bloquées : ${blocked.length}`,
	);

	if (blocked.length > 0) {
		console.log(
			"\n✖ Non réservables en ligne (aucune option de prix active) :",
		);
		for (const row of blocked) {
			console.log(
				`  ${row.category} › ${row.item}${row.sku ? ` (${row.sku})` : ""} — stock ${row.stock}`,
			);
			console.log(
				`    → /activite/${row.category_slug}/${row.item_slug} : renseigner au moins une durée avec prix + code-barres caisse`,
			);
		}
	}

	if (durations.length > 0) {
		const activeOptions = await sql<{ variant_id: string; duration: number }[]>`
			SELECT "variant_id", "duration"
			FROM "price_options"
			WHERE "is_active"
		`;
		const covered = new Set(
			activeOptions.map((option) => `${option.variant_id}:${option.duration}`),
		);
		const variants = await sql<
			Array<{ id: string; item: string; sku: string | null }>
		>`
			SELECT v."id", i."name" AS item, v."decathlon_sku" AS sku
			FROM "item_variants" v
			INNER JOIN "items" i ON i."id" = v."item_id"
			ORDER BY i."name"
		`;

		const gaps = variants
			.map((variant) => ({
				...variant,
				missing: durations
					.filter((duration) => !covered.has(`${variant.id}:${duration.days}`))
					.map((duration) => duration.days),
			}))
			.filter((variant) => variant.missing.length > 0);

		if (gaps.length > 0) {
			console.log(
				"\n⚠ Durées définies en admin mais non couvertes par une option active :",
			);
			for (const gap of gaps) {
				console.log(
					`  ${gap.item}${gap.sku ? ` (${gap.sku})` : ""} → ${gap.missing.length}/${durations.length} durée(s) manquante(s) : ${gap.missing.join(" j, ")} j`,
				);
			}
		} else {
			console.log(
				`\n✔ Toutes les variantes couvrent les ${durations.length} durées définies en admin.`,
			);
		}
	}

	console.log(
		"\nRappel : le prix et le QR/code-barres remis au client proviennent de l'option active correspondant à la durée réservée.",
	);
}

main()
	.catch((error) => {
		console.error("✖ Audit échoué :", error);
		process.exitCode = 1;
	})
	.finally(() => sql.end());
