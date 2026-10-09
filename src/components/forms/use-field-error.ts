import { useStore } from "@tanstack/react-form";
import { useState } from "react";
import { useFieldContext } from "./app-form-context";

/**
 * Affichage d'une erreur de champ.
 *
 * La validation reste celle déclarée par le formulaire (`onChange`, `onBlur`,
 * `onSubmit`) : seul l'affichage est filtré. Une erreur ne se montre que lorsque
 * le champ est « au repos » :
 *
 * - tant que le champ n'a jamais été quitté, rien ne s'affiche (comportement
 *   TanStack Form, `isTouched`) ;
 * - après un blur invalide : bordure, label et message passent au rouge ;
 * - dès que le champ reprend le focus pour être corrigé, tout redevient calme
 *   pendant la frappe, le temps de n'être plus rouge qu'une fois la condition
 *   réellement remplie ;
 * - exception : après une tentative d'envoi échouée (`submissionAttempts`),
 *   l'erreur reste visible même focalisée, pour ne jamais bloquer un envoi
 *   par Entrée sans feedback.
 */
export function useFieldError<TValue>() {
	const field = useFieldContext<TValue>();

	const errors = useStore(field.store, (state) => state.meta.errors);
	const isValid = useStore(field.store, (state) => state.meta.isValid);
	const isTouched = useStore(field.store, (state) => state.meta.isTouched);
	// `field.form` plutôt que `useFormContext()` : ce hook tourne aussi dans les
	// champs rendus hors composant de formulaire (tests, champs imbriqués), où
	// le contexte de formulaire n'est pas monté.
	const submissionAttempts = useStore(
		field.form.store,
		(state) => state.submissionAttempts,
	);
	const [isFocused, setIsFocused] = useState(false);

	const invalid = isTouched && !isValid;
	const showError = invalid && (!isFocused || submissionAttempts > 0);

	return {
		errors,
		showError,
		focusProps: {
			onFocus: () => setIsFocused(true),
			onBlur: () => {
				setIsFocused(false);
				field.handleBlur();
			},
		},
	};
}
