import type { ReactNode } from "react";

/**
 * Conteneur de la barre d'action mobile, fixée en bas d'écran. À placer hors des
 * conteneurs `space-y` : leur marge décalerait un élément `fixed` de son bord bas.
 * La page compense avec un padding bas (`pb-32 md:pb-12`).
 */
export function MobileStickyBar({ children }: { children: ReactNode }) {
	return (
		<div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2.5 sm:px-4 sm:py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md supports-[padding-bottom:env(safe-area-inset-bottom)]:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
			<div className="mx-auto max-w-md">{children}</div>
		</div>
	);
}
