import { z } from "zod";

export const newClientSchema = z.object({
	name: z.string().trim().min(1, "Le nom est requis"),
	email: z.string().trim().email("Email invalide"),
	phone: z.string().trim().min(1, "Le téléphone est requis"),
});

export type ClientValidationInput =
	| {
			mode: "existing";
			selectedUserId: string;
			knownUserIds: string[];
	  }
	| {
			mode: "new";
			name: string;
			email: string;
			phone: string;
	  };

export type ClientFieldErrors = Partial<
	Record<"user" | "name" | "email" | "phone", string>
>;

export type ClientValidationResult = {
	valid: boolean;
	errors: ClientFieldErrors;
};

export function validateClient(
	input: ClientValidationInput,
): ClientValidationResult {
	if (input.mode === "existing") {
		const isKnownUser = input.knownUserIds.includes(input.selectedUserId);
		return {
			valid: Boolean(input.selectedUserId) && isKnownUser,
			errors: isKnownUser ? {} : { user: "Sélectionnez un client" },
		};
	}

	const parsed = newClientSchema.safeParse({
		name: input.name,
		email: input.email,
		phone: input.phone,
	});
	if (parsed.success) return { valid: true, errors: {} };

	const errors: ClientFieldErrors = {};
	for (const issue of parsed.error.issues) {
		const field = issue.path[0];
		if (field === "name" || field === "email" || field === "phone") {
			errors[field] ??= issue.message;
		}
	}
	return { valid: false, errors };
}
