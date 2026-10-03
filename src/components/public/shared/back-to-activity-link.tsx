import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "#/lib/utils";

/** Sortie d'une fiche sans issue : retour à la liste des matériels de l'activité. */
export function BackToActivityLink({
	activitySlug,
	className,
}: {
	activitySlug: string;
	className?: string;
}) {
	return (
		<Link
			to="/activite/$activitySlug"
			params={{ activitySlug }}
			className={cn(
				"inline-flex items-center gap-1.5 text-sm font-semibold no-underline",
				className,
			)}
		>
			<ArrowLeft className="size-4" aria-hidden="true" />
			Voir les autres matériels
		</Link>
	);
}
