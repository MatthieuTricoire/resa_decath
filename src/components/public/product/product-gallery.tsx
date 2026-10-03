import type { PublicProductImage } from "#/features/equipements/public-queries";

/** Visuel et description du matériel. */
export function ProductGallery({
	name,
	image,
	description,
}: {
	name: string;
	image: PublicProductImage | null;
	description: string | null;
}) {
	return (
		<div className="space-y-4">
			<div className="island-shell aspect-[4/3] overflow-hidden rounded-2xl bg-[var(--sand)]">
				{image ? (
					<img
						src={image.url}
						alt={image.alt ?? name}
						className="size-full object-cover"
						fetchPriority="high"
						decoding="async"
					/>
				) : (
					<div className="grid size-full place-items-center text-sm text-[var(--sea-ink-soft)]">
						Image à venir
					</div>
				)}
			</div>
			{description && (
				<p className="text-sm leading-relaxed text-[var(--sea-ink-soft)]">
					{description}
				</p>
			)}
		</div>
	);
}
