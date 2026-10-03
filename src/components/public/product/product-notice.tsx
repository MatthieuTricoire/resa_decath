import { DurationConflictNotice } from "#/components/public/duration-conflict-notice";
import type { ProductNotice as ProductNoticeData } from "#/components/public/product/derive-selection";
import { BackToActivityLink } from "#/components/public/shared/back-to-activity-link";
import { Callout } from "#/components/public/shared/callout";

/**
 * L'unique message de la fiche. Un seul `kind` est actif à la fois : le grisé
 * des options et le libellé du bouton sont des états, pas des messages, donc
 * rien ici ne les double.
 */
export function ProductNotice({
	notice,
	activitySlug,
	currentDuration,
	durations,
	priceByDuration,
	onPickDuration,
}: {
	notice: ProductNoticeData;
	activitySlug: string;
	currentDuration: number;
	durations: number[];
	priceByDuration: Record<number, number>;
	onPickDuration: (durationDays: number) => void;
}) {
	switch (notice.kind) {
		case "none":
			return null;
		case "not_bookable":
			// Sans issue, une fiche non vendable est un cul-de-sac.
			return (
				<Callout action={<BackToActivityLink activitySlug={activitySlug} />}>
					<p>
						Ce matériel n’est pas réservable en ligne pour le moment. Passez au
						comptoir location du magasin.
					</p>
				</Callout>
			);
		case "duration_not_priced":
			return (
				<DurationConflictNotice
					currentDuration={currentDuration}
					durations={durations}
					priceByDuration={priceByDuration}
					onPickDuration={onPickDuration}
				/>
			);
		case "blocked":
			return (
				<Callout
					role="status"
					action={<BackToActivityLink activitySlug={activitySlug} />}
				>
					<p>
						{notice.message} Choisissez d’autres dates ou un autre matériel.
					</p>
				</Callout>
			);
	}
}
