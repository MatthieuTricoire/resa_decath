import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Mountain } from "lucide-react";
import { toast } from "sonner";
import { useAppForm } from "#/components/forms/app-form";
import { Field, FieldGroup } from "#/components/ui/field";
import { store, storeCanonicalPath } from "#/config/store";
import { requestResetSchema } from "#/features/auth/reset-password.schema";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/admin/mot-de-passe-oublie")({
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = useNavigate();

	const form = useAppForm({
		defaultValues: { email: "" },
		validators: { onChange: requestResetSchema },
		onSubmit: async ({ value }) => {
			const { email } = value;
			const { error } = await authClient.emailOtp.requestPasswordReset({
				email,
			});
			// Réponse serveur volontairement neutre (anti-énumération) : on
			// avance vers l'écran du code que le compte existe ou non.
			if (!error) {
				navigate({
					to: "/admin/reinitialiser-mot-de-passe",
					search: { email },
				});
				return;
			}
			toast.error(
				"Impossible d'envoyer le code pour le moment. Réessayez dans quelques minutes.",
			);
		},
	});

	return (
		<div className="grid min-h-svh lg:grid-cols-2">
			<div className="flex flex-col gap-4 p-6 md:p-10">
				<Link
					to={storeCanonicalPath}
					className="flex w-fit items-center gap-2 no-underline"
				>
					<Mountain
						className="size-5 text-primary dark:text-[#9aa7f5]"
						aria-hidden="true"
					/>
					<span className="display-title text-base font-semibold text-primary dark:text-[#9aa7f5]">
						{store.name}
					</span>
				</Link>
				<div className="flex flex-1 items-center justify-center">
					<div className="w-full max-w-xs">
						<div className="mb-6">
							<h1 className="display-title text-3xl font-semibold">
								Mot de passe oublié
							</h1>
							<p className="mt-1 text-sm text-balance text-muted-foreground">
								Saisissez l'email de votre compte. S'il existe, un code de
								vérification vous sera envoyé.
							</p>
						</div>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
						>
							<FieldGroup>
								<form.AppField name="email">
									{(field) => (
										<field.TextField
											label="Email"
											type="email"
											placeholder="m@example.com"
										/>
									)}
								</form.AppField>
								<Field>
									<form.AppForm>
										<form.SubscribeButton label="Envoyer le code" />
									</form.AppForm>
								</Field>
							</FieldGroup>
						</form>
						<p className="mt-6 text-sm text-muted-foreground">
							<Link
								to="/admin/login"
								className="font-medium text-foreground underline-offset-4 hover:underline"
							>
								Retour à la connexion
							</Link>
						</p>
					</div>
				</div>
			</div>
			<div className="relative hidden bg-muted lg:block">
				<img
					src="https://media.decathlon-outdoor.com/1cxTAoSmK978K8PKJ3yS17/randonnee-au-lac-du-montagnon-par-le-col-d-iseye.jpg?w=2400"
					alt="Lac du montagnon"
					className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
				/>
			</div>
		</div>
	);
}
