import type {
	PublicCodeImages,
	PublicReservationLine,
	PublicReservationWithCodes,
} from "#/features/reservations/public-queries";
import { rentalDurationLabel } from "#/lib/dates";

/** Ce que la ligne contient, sans l'argent : sert de légende sous chaque code. */
export function lineSpecs(line: PublicReservationLine): string[] {
	return [
		line.variantLabel ? `Variante : ${line.variantLabel}` : null,
		rentalDurationLabel(line.durationDays).toLowerCase(),
	].filter((part): part is string => Boolean(part));
}

/** Une ligne, ses codes, et le nombre d'articles à scanner. */
type CodeGroup = {
	key: string;
	line: PublicReservationLine;
	units: { key: string; images: PublicCodeImages; index: number }[];
};

/**
 * Déplie chaque ligne en un code par unité : trois bâtons donnent trois blocs
 * numérotés, qui partagent la même image. Les clés sont composées ici plutôt
 * qu'avec un index de boucle, pour survivre à un réordonnancement.
 */
function codeGroups(data: PublicReservationWithCodes): CodeGroup[] {
	const groups: CodeGroup[] = [];
	data.lines.forEach((line, lineIndex) => {
		const images = data.codes[line.barcode];
		if (!images || line.quantity < 1) return;
		groups.push({
			key: `line-${lineIndex + 1}`,
			line,
			units: Array.from({ length: line.quantity }, (_unused, unitIndex) => ({
				key: `line-${lineIndex + 1}-unit-${unitIndex + 1}`,
				images,
				index: unitIndex + 1,
			})),
		});
	});
	return groups;
}

/**
 * Les codes de retrait, un par article : les mêmes images que dans l'email,
 * rendues par le générateur unique de `#/lib/codes`.
 *
 * Empilés et numérotés : la largeur d'un Code128 ne se comprime pas, et c'est
 * la lisibilité qui compte quand le caissier balaie l'écran avec son lecteur.
 * La numérotation rend la progression explicite, pour qu'un code sur trois ne
 * soit pas oublié.
 */
export function WithdrawalCodes({
	data,
}: {
	data: PublicReservationWithCodes;
}) {
	const groups = codeGroups(data);
	if (groups.length === 0) return null;

	const total = groups.reduce((sum, group) => sum + group.units.length, 0);
	return (
		<section className="island-shell rounded-2xl p-6">
			<h2 className="island-kicker">Codes de retrait</h2>
			<p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
				{total > 1
					? `Présentez ces ${total} codes au comptoir, un par article : le prix est appliqué automatiquement.`
					: "Présentez ce code au comptoir : le prix est appliqué automatiquement."}
			</p>

			{groups.map((group) => (
				<div key={group.key} className="mt-5">
					<p className="text-sm font-semibold">
						{group.line.quantity > 1
							? `${group.line.quantity} × ${group.line.itemName}`
							: group.line.itemName}
						<span className="font-normal text-[var(--sea-ink-soft)]">
							{" · "}
							{lineSpecs(group.line).join(" · ")}
						</span>
					</p>

					<div className="mt-2 flex flex-col gap-3">
						{group.units.map((unit) => (
							<div
								key={unit.key}
								className="rounded-xl border border-[var(--line)] bg-white p-4"
							>
								{group.units.length > 1 && (
									<p className="mb-2 text-xs font-semibold tracking-[0.08em] text-[var(--sea-ink-soft)] uppercase">
										Code {unit.index} sur {group.units.length}
									</p>
								)}
								{unit.images.code128 && (
									<img
										src={unit.images.code128.src}
										width={unit.images.code128.width}
										height={unit.images.code128.height}
										alt={`Code-barres ${group.line.barcode}`}
										className="block h-auto w-full max-w-[360px]"
									/>
								)}
								<p
									className={`text-center font-mono text-base font-semibold break-all ${unit.images.code128 ? "mt-3" : ""}`}
								>
									{group.line.barcode}
								</p>
								<p className="mt-1 text-center text-xs text-[var(--sea-ink-soft)]">
									Si le code ne se scanne pas, dictez-le au comptoir.
								</p>
							</div>
						))}
					</div>
				</div>
			))}
		</section>
	);
}
