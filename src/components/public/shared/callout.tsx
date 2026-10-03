import { Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "#/lib/utils";

export type CalloutTone = "neutral" | "warning" | "info";

const TONE_CLASSES: Record<CalloutTone, string> = {
	neutral: "border border-[var(--line)] bg-[var(--surface)]",
	warning:
		"bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
	info: "border border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)]",
};

/**
 * Encart d'information ou de refus. Le texte vient de l'appelant (rédigé par le
 * code qui refuse) ; `role` est à fournir : `alert` pour une erreur, `status`
 * pour un message qui apparaît en réaction à un choix, rien pour du statique.
 */
export function Callout({
	tone = "neutral",
	role,
	icon,
	children,
	action,
	className,
}: {
	tone?: CalloutTone;
	role?: "alert" | "status";
	/** Icône `lucide-react` ; par défaut `Info` ou `TriangleAlert` selon le ton. */
	icon?: ReactNode;
	children: ReactNode;
	/** Sortie proposée sous le texte (lien, bouton). */
	action?: ReactNode;
	className?: string;
}) {
	const defaultIcon =
		tone === "info" ? (
			<Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
		) : (
			<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
		);
	return (
		<div
			role={role}
			className={cn("rounded-xl p-4 text-sm", TONE_CLASSES[tone], className)}
		>
			<div className="flex items-start gap-2">
				{icon ?? defaultIcon}
				<div className="min-w-0 flex-1">{children}</div>
			</div>
			{action ? <div className="mt-2 pl-6">{action}</div> : null}
		</div>
	);
}
