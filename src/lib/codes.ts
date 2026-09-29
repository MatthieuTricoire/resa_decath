import { code128 as renderCode128 } from "@bwip-js/node";

/**
 * Génération des codes de retrait, pour l'email comme pour la page de
 * confirmation. Une seule source de vérité : le codebarres affiché dans l'email
 * et celui affiché sur la page sont bit pour bit le même, donc le client ne peut
 * pas voir deux versions différentes de sa réservation.
 *
 * Le format retenu en caisse est le Code128, publié en grand ; si le code est
 * trop long pour un Code128 lisible, sa version en toutes lettres reste écrite
 * sous la carte — c'est elle qui sert de secours au comptoir.
 *
 * Le tout en PNG, généré en Node sans canvas (`toBuffer`). C'est aussi le seul
 * endroit du dépôt qui importe `bwip-js`, ce qui garde la décision de format et
 * la dépendance confinées à un seul fichier. Chaque consommateur décide ensuite
 * comment transporter les octets : `cid:` en pièce jointe pour l'email, `data:`
 * en URI pour la page.
 */

/** Facteur d'échelle : assez pour être net sur un écran de téléphone dense. */
const SCALE = 6;

/**
 * Largeur native au-delà de laquelle le Code128 est abandonné.
 *
 * Mesuré sur la colonne `price_options.barcode` (`varchar(50)`) : 8 caractères
 * donnent 720 px, 13 caractères 786 px, mais 50 caractères 3558 px. Au-delà de
 * `MAX_CODE128_WIDTH` un Code128 ne tient plus lisiblement sur un écran et ne
 * peut plus être lu correctement. Seule la version en toutes lettres sert alors
 * de secours, écrite sous la carte.
 */
const MAX_CODE128_WIDTH = 1040;

/** Largeur d'affichage, en pixels CSS, dans la largeur utile du mail. */
const CODE128_DISPLAY_WIDTH = 360;

export type CodeImages = {
	barcode: string;
	/** Absent quand le code est trop long pour un Code128 lisible. */
	code128?: {
		buffer: Buffer;
		displayWidth: number;
		width: number;
		height: number;
	};
};

/**
 * Dimensions natives d'un PNG, lues dans son en-tête IHDR.
 *
 * Servent au seul `MAX_CODE128_WIDTH`, et permettent de donner au navigateur
 * les vraies dimensions d'une image : sans elles, la page saute en la chargeant.
 */
function pngDimensions(buffer: Buffer): { width: number; height: number } {
	// 8 octets de signature, 4 de longueur IHDR, 4 de type, puis largeur, hauteur.
	return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function code128Png(barcode: string): Promise<Buffer> {
	return renderCode128({
		bcid: "code128",
		text: barcode,
		scale: SCALE,
		height: 10,
		// Le code est déjà écrit en toutes lettres sous l'image, inutile de le
		// doubler dans le PNG.
		includetext: false,
		paddingwidth: 4,
		paddingheight: 2,
	});
}

/** Rend un code. Un PNG trop long perd son Code128, seule la version texte sert. */
export async function renderCode(barcode: string): Promise<CodeImages> {
	const code128 = await code128Png(barcode);
	const code128Size = pngDimensions(code128);
	return {
		barcode,
		...(code128Size.width <= MAX_CODE128_WIDTH
			? {
					code128: {
						buffer: code128,
						displayWidth: CODE128_DISPLAY_WIDTH,
						...code128Size,
					},
				}
			: {}),
	};
}

/**
 * Rend chaque code **distinct** une seule fois. Une ligne de trois bâtons
 * référence trois fois la même image plutôt que d'en générer trois : c'est le
 * comportement voulu au comptoir, et l'email reste léger.
 */
export async function renderCodes(
	barcodes: string[],
): Promise<Map<string, CodeImages>> {
	const distinct = [...new Set(barcodes.filter(Boolean))];
	const entries = await Promise.all(
		distinct.map(
			async (barcode) => [barcode, await renderCode(barcode)] as const,
		),
	);
	return new Map(entries);
}

/**
 * Un `data:` URI pour la page web. Un navigateur sait les gérer nativement,
 * contrairement à Gmail — d'où le `cid:` de l'email, et non celui-ci.
 */
export function pngDataUri(buffer: Buffer): string {
	return `data:image/png;base64,${buffer.toString("base64")}`;
}
