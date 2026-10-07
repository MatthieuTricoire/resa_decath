import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Mountain } from "lucide-react";
import { toast } from "sonner";
import { useAppForm } from "#/components/forms/app-form";
import { Field, FieldGroup } from "#/components/ui/field";
import { store, storeCanonicalPath } from "#/config/store";
import { resetPasswordSchema } from "#/features/auth/reset-password.schema";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/admin/reinitialiser-mot-de-passe")({
	validateSearch: (search: Record<string, unknown>) => ({
		email: typeof search.email === "string" ? search.email : "",
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const { email: prefilledEmail } = Route.useSearch();
	const navigate = useNavigate();

	const form = useAppForm({
		defaultValues: {
			email: prefilledEmail,
			otp: "",
			newPassword: "",
			confirmPassword: "",
		},
		validators: { onChange: resetPasswordSchema },
		onSubmit: async ({ value }) => {
			const { email, otp, newPassword } = value;
			const { error } = await authClient.emailOtp.resetPassword({
				email,
				otp,
				password: newPassword,
			});
			if (error) {
				if (error.status === 400 || error.status === 401) {
					toast.error(
						"Code invalide ou expiré. Vous pouvez redemander un code.",
					);
				} else {
					toast.error(`Une erreur est survenue : ${error.message}`);
				}
				return;
			}
			toast.success(
				"Mot de passe réinitialisé. Connectez-vous avec votre nouveau mot de passe.",
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
						<div className="mb-6">
							<h1 className="display-title text-3xl font-semibold">
								Réinitialiser mon mot de passe
							</h1>
							<p className="mt-1 text-sm text-balance text-muted-foreground">
								Saisissez le code reçu par email, puis choisissez un nouveau mot
								de passe.
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
								<form.AppField name="otp">
									{(field) => (
										<field.TextField
											label="Code de vérification"
											type="text"
											placeholder="123456"
										/>
									)}
								</form.AppField>
								<form.AppField name="newPassword">
									{(field) => (
										<field.TextField
											label="Nouveau mot de passe"
											type="password"
										/>
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
										<form.SubscribeButton label="Réinitialiser" />
									</form.AppForm>
								</Field>
							</FieldGroup>
						</form>
						<p className="mt-6 text-sm text-muted-foreground">
							<Link
								to="/admin/mot-de-passe-oublie"
								className="font-medium text-foreground underline-offset-4 hover:underline"
							>
								Renvoyer un code
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
