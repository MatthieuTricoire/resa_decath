import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Mountain } from "lucide-react";
import { toast } from "sonner";
import { useAppForm } from "#/components/forms/app-form";
import { Button } from "#/components/ui/button";
import { Field, FieldGroup } from "#/components/ui/field";
import { store, storeCanonicalPath } from "#/config/store";
import { setPasswordSchema } from "#/features/auth/create-team-account.schema";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/admin/definir-mot-de-passe")({
	validateSearch: (search: Record<string, unknown>) => ({
		token: typeof search.token === "string" ? search.token : "",
		error: typeof search.error === "string" ? search.error : "",
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const { token, error: searchError } = Route.useSearch();
	const navigate = useNavigate();

	const isInvalidToken = !token || searchError === "INVALID_TOKEN";

	const form = useAppForm({
		defaultValues: {
			password: "",
			confirmPassword: "",
		},
		validators: { onChange: setPasswordSchema },
		onSubmit: async ({ value }) => {
			const { error } = await authClient.resetPassword({
				newPassword: value.password,
				token,
			});

			if (error) {
				if (
					error.status === 400 ||
					error.code === "INVALID_TOKEN" ||
					error.message?.includes("token")
				) {
					toast.error(
						"Ce lien d'invitation a expiré ou n'est plus valide. Demandez à votre administrateur de vous renvoyer une invitation.",
					);
				} else {
					toast.error(
						error.message ||
							"Une erreur est survenue lors de l'enregistrement de votre mot de passe.",
					);
				}
				return;
			}

			toast.success(
				"Mot de passe enregistré avec succès ! Vous pouvez maintenant vous connecter.",
			);
			navigate({ to: "/admin/login" });
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
						{isInvalidToken ? (
							<div className="flex flex-col gap-4">
								<div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
									<AlertCircle className="size-6" aria-hidden="true" />
								</div>
								<div>
									<h1 className="display-title text-2xl font-semibold">
										Lien invalide ou expiré
									</h1>
									<p className="mt-2 text-sm text-muted-foreground">
										Ce lien d'invitation n'est plus valable (durée de validité :
										48 heures) ou a déjà été utilisé.
									</p>
									<p className="mt-2 text-sm text-muted-foreground">
										Veuillez contacter votre administrateur afin qu'il vous
										renvoie une invitation.
									</p>
								</div>
								<Button asChild className="mt-4">
									<Link to="/admin/login">Aller à la page de connexion</Link>
								</Button>
							</div>
						) : (
							<div>
								<div className="mb-6">
									<h1 className="display-title text-3xl font-semibold">
										Définir mon mot de passe
									</h1>
									<p className="mt-1 text-sm text-balance text-muted-foreground">
										Bienvenue dans l'équipe ! Définissez votre mot de passe pour
										accéder au tableau de bord.
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
										<form.AppField name="password">
											{(field) => (
												<field.TextField
													label="Nouveau mot de passe"
													type="password"
													placeholder="Au moins 8 caractères"
												/>
											)}
										</form.AppField>

										<form.AppField name="confirmPassword">
											{(field) => (
												<field.TextField
													label="Confirmer le mot de passe"
													type="password"
													placeholder="Confirmez votre mot de passe"
												/>
											)}
										</form.AppField>

										<Field>
											<form.AppForm>
												<form.SubscribeButton label="Enregistrer mon mot de passe" />
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
						)}
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
