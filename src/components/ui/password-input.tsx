import { Eye, EyeOff } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "#/components/ui/input-group.tsx";

/**
 * Champ mot de passe avec bouton œil pour afficher / masquer la saisie.
 * Le `type` passé en prop est ignoré : il est piloté par l'état interne.
 */
function PasswordInput({ className, ...props }: React.ComponentProps<"input">) {
	const [visible, setVisible] = useState(false);

	return (
		<InputGroup className={className}>
			<InputGroupInput {...props} type={visible ? "text" : "password"} />
			<InputGroupAddon align="inline-end">
				<InputGroupButton
					type="button"
					variant="ghost"
					size="icon-xs"
					aria-label={
						visible ? "Masquer le mot de passe" : "Afficher le mot de passe"
					}
					aria-pressed={visible}
					onClick={() => setVisible((current) => !current)}
				>
					{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	);
}

export { PasswordInput };
