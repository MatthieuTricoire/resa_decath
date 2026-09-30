/**
 * Garde-fou du bundle client.
 *
 * Un module qui importe `#/db` tire le pilote PostgreSQL, dont le code fait
 * `Buffer.allocUnsafe()` au chargement. Or `Buffer` n'existe pas dans un
 * navigateur : un seul chemin du navigateur vers cet import, et la page affiche
 * « Something went wrong! » avec une erreur qui ne parle pas du vrai coupable.
 *
 * C'est exactement ce qui est arrivé avec `public-queries.ts`, aujourd'hui
 * corrigé par la découpe en `.server.ts`. Ce script empêche la régression : il
 * lit le bundle réellement produit et échoue si un marqueur serveur y revient.
 *
 * Tourné automatiquement après `npm run build` (hook `postbuild`).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Dossiers où le client est écrit par le build.
 * Avec le plugin `nitro()`, le public part dans `.output/public` (preset
 * `node-server` : dev, VPS). Sur Vercel, le preset `vercel` ajoute
 * `.vercel/output/static` : on accepte les deux pour que `postbuild` passe
 * quel que soit l'hébergeur.
 */
const CLIENT_CANDIDATES = [".output/public", ".vercel/output/static"];

/**
 * Marqueurs interdits dans le bundle client, et ce qu'ils trahissent.
 *
 * Chacun a été vérifié absent de `.output/public` et présent de
 * `.output/server` : un marqueur qui ne se déclenche jamais ne protège de rien.
 *
 * Volontairement exclus, alors qu'ils semblent évidents :
 *   - `"code128"` : nos propres composants lisent `images.code128`, et seule la
 *     forme entre guillemets l'éviterait — trop fragile.
 *   - `"qrcode"` : `@tabler_icons-react` contient l'icône `Qrcode`, donc ce
 *     marqueur déclenche déjà aujourd'hui sur une page qui affiche une icône.
 *   - `require_browser_external` : nom de module optimisé propre au serveur de
 *     dev, absent d'un build de production — il ne se déclencherait jamais ici.
 *
 * `bcid` est le nom de champ que `@bwip-js` utilise pour ses identifiants de
 * format de code-barres, et `drizzle-orm` le nom du paquet de l'ORM.
 */
const FORBIDDEN: { marker: string; reason: string }[] = [
	{
		marker: "allocUnsafe",
		reason: "pilote PostgreSQL (`postgres/src/bytes.js`) : exige `Buffer`, absent du navigateur",
	},
	{
		marker: "Buffer.alloc",
		reason: "allocation mémoire Node : du code serveur dans le navigateur",
	},
	{
		marker: "drizzle-orm",
		reason: "ORM de la base de données : rien à faire côté navigateur",
	},
	{
		marker: "bcid",
		reason: "générateur de code-barres `@bwip-js` : les images sont rendues côté serveur",
	},
];

function collectJsFiles(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) {
			found.push(...collectJsFiles(path));
		} else if (path.endsWith(".js") || path.endsWith(".mjs")) {
			found.push(path);
		}
	}
	return found;
}

function humanSize(bytes: number): string {
	return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function resolveClientDir(): string {
	for (const candidate of CLIENT_CANDIDATES) {
		if (existsSync(candidate)) return candidate;
	}
	return CLIENT_CANDIDATES[0];
}

const CLIENT_DIR = resolveClientDir();

if (!existsSync(CLIENT_DIR)) {
	console.error(
		`✗ ${CLIENT_DIR} est absent. Lance d'abord \`npm run build\` (ce script se lance tout seul après le build).`,
	);
	process.exit(1);
}

const files = collectJsFiles(CLIENT_DIR);
const offences: { file: string; marker: string; reason: string }[] = [];
let totalBytes = 0;

for (const file of files) {
	const source = readFileSync(file);
	totalBytes += source.length;
	for (const { marker, reason } of FORBIDDEN) {
		if (source.includes(marker)) {
			offences.push({ file, marker, reason });
		}
	}
}

if (offences.length > 0) {
	console.error(
		`\n✗ ${offences.length} marqueur(s) serveur trouvé(s) dans le bundle client :\n`,
	);
	for (const { file, marker, reason } of offences) {
		console.error(`  ${file}`);
		console.error(`    « ${marker} » — ${reason}`);
	}
	console.error(
		"\nUn module atteignable par une page importe probablement #/db sans être\n" +
			"un fichier `.server.ts`. Déplace ce code dans un `.server.ts` (le plugin\n" +
			"TanStack Start le retire alors du bundle client) et enveloppe la fonction\n" +
			"dans `createServerOnlyFn`.\n",
	);
	process.exit(1);
}

/**
 * Garde-fou des fichiers statiques SEO : les éléments dont dépend le crawl
 * (robots, manifest, icônes) doivent survivre au build. Sans eux, ce script
 * ne détectait que des régressions JS ; un `robots.txt` supprimé ou une route
 * sitemap renommée passaient inaperçus.
 */
const STATIC_REQUIRED: Array<{
	file: string;
	needles?: Array<{ needle: string; label: string }>;
}> = [
	{
		file: "robots.txt",
		needles: [
			{
				needle: "Sitemap: https://www.decathlon-mountain-laruns.fr/sitemap.xml",
				label: "URL publique de la sitemap (réécrite par l'hébergeur)",
			},
			{
				needle: "Disallow: /admin",
				label: "exclusion des pages d'administration",
			},
		],
	},
	{
		file: "manifest.json",
		needles: [
			{
				needle: '"theme_color": "#1f2937"',
				label: "couleur du thème alignée sur la marque",
			},
		],
	},
	{ file: "favicon.ico" },
	{ file: "logo192.png" },
	{ file: "logo512.png" },
];

const staticProblems: string[] = [];
for (const { file, needles = [] } of STATIC_REQUIRED) {
	let source: string;
	try {
		source = readFileSync(join(CLIENT_DIR, file), "utf8");
	} catch {
		staticProblems.push(`${file} (fichier absent du build)`);
		continue;
	}
	for (const { needle, label } of needles) {
		if (!source.includes(needle)) {
			staticProblems.push(`${file} (contenu manquant : ${label})`);
		}
	}
}

if (staticProblems.length > 0) {
	console.error("\n✗ Fichiers statiques SEO incomplets :\n");
	for (const problem of staticProblems) {
		console.error(`  ${problem}`);
	}
	console.error(
		"\nVérifie `public/` et la réécriture `/sitemap.xml` → `/api/sitemap` (vercel.json sur Vercel, Caddy/Cloudflare en VPS).\n",
	);
	process.exit(1);
}

console.log(
	`✓ ${files.length} fichiers client, ${humanSize(totalBytes)} : aucun marqueur serveur, SEO statique complet.`,
);
