import { toast } from "sonner";
import { ConfirmDeleteDialog } from "#/components/dialogs/ConfirmDeleteDialog";
import { useAppForm } from "#/components/forms/app-form";
import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";
import { cn } from "#/lib/utils";
import { openDialog } from "#/stores/dialog.store";
import { Field, FieldGroup } from "@/components/ui/field";
import { loginSchema } from "../login.schema";

export function LogInForm({
	className,
	...props
}: React.ComponentProps<"div">) {
	const form = useAppForm({
		defaultValues: {
			email: "admin@decathlon.com",
			password: "SuperSecretPassword123!",
		},
		validators: {
			onChange: loginSchema,
		},
		onSubmit: async ({ value }) => {
			const { email, password } = value;
			await authClient.signIn.email(
				{
					email,
					password: password,
				},
				{
					onError: (ctx) => {
						if (ctx.error.status === 401) {
							toast.error("Email ou mot de passe incorrect.");
						} else {
							toast.error(`Une erreur est survenue :${ctx.error.message}`);
						}
					},
					onSuccess: async () => {
						const { data: session } = await authClient.getSession();

						if (
							session?.user.role === "admin" ||
							session?.user.role === "manager"
						) {
							window.location.href = "/admin";
						} else {
							await authClient.signOut();
							toast.error(
								"Vous n'avez pas accès à cette page. Réservée aux administrateurs et gérants.",
							);
						}
					},
				},
			);
		},
	});

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<FieldGroup>
					<div className="flex flex-col items-center gap-1 text-center">
						<h1 className="text-2xl font-bold">Se connecter</h1>
						<p className="text-sm text-balance text-muted-foreground">
							Entres ton mail en dessous pour te connecter à ton compte admin.
						</p>
					</div>

					<form.AppField name="email">
						{(field) => (
							<field.TextField
								label="Email"
								placeholder="m@example.com"
								type="email"
							/>
						)}
					</form.AppField>

					<form.AppField name="password">
						{(field) => <field.TextField label="Password" type="password" />}
					</form.AppField>

					<Field>
						<form.AppForm>
							<form.SubscribeButton label="Login" />
						</form.AppForm>
					</Field>
				</FieldGroup>
			</form>

			<Button
				variant="outline"
				onClick={() =>
					openDialog("confirmDelete", {
						title: "Tester la dialog",
						description:
							"Ceci est un test pour vérifier que la dialog fonctionne.",
						onConfirm: async () => {
							toast.success("Test réussi !");
						},
					})
				}
			>
				Tester la dialog
			</Button>

			<ConfirmDeleteDialog />
		</div>
	);
}
