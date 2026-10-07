import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAppForm } from "#/components/forms/app-form";
import { Field, FieldGroup } from "#/components/ui/field";
import { changePasswordSchema } from "#/features/auth/change-password.schema";
import { getDashboardSession } from "#/features/auth/queries";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/admin/_layout/compte")({
	loader: async () => {
		const session = await getDashboardSession();
		return { user: session.user };
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { user } = Route.useLoaderData();

	const form = useAppForm({
		defaultValues: {
			currentPassword: "",
			newPassword: "",
			confirmPassword: "",
		},
		validators: {
			onChange: changePasswordSchema,
		},
		onSubmit: async ({ value }) => {
			const { currentPassword, newPassword } = value;
			const { error } = await authClient.changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions: true,
			});

			if (error) {
				if (error.status === 400) {
					toast.error("Mot de passe actuel incorrect.");
				} else {
					toast.error(`Une erreur est survenue : ${error.message}`);
				}
				return;
			}

			toast.success(
				"Mot de passe modifié. Les autres sessions ont été déconnectées.",
			);
			form.reset();
		},
	});

	return (
		<div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 px-4 py-6 md:gap-10 md:py-8 lg:px-6">
			<div>
				<h2 className="text-lg font-semibold">Mon compte</h2>
				<p className="text-sm text-muted-foreground">
					{user.name} — {user.email}
				</p>
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="flex max-w-md flex-col gap-6"
			>
				<FieldGroup>
					<form.AppField name="currentPassword">
						{(field) => (
							<field.TextField label="Mot de passe actuel" type="password" />
						)}
					</form.AppField>

					<form.AppField name="newPassword">
						{(field) => (
							<field.TextField label="Nouveau mot de passe" type="password" />
						)}
					</form.AppField>

					<form.AppField name="confirmPassword">
						{(field) => (
							<field.TextField
								label="Confirmer le nouveau mot de passe"
								type="password"
							/>
						)}
					</form.AppField>

					<Field>
						<form.AppForm>
							<form.SubscribeButton label="Enregistrer" />
						</form.AppForm>
					</Field>
				</FieldGroup>
			</form>
		</div>
	);
}
