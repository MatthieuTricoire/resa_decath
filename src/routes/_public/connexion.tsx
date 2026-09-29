import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "#/components/forms/app-form";
import { Button } from "#/components/ui/button";
import { Field, FieldGroup } from "#/components/ui/field";
import { storeCanonicalPath } from "#/config/store";
import { authClient } from "#/lib/auth-client";
import { buildPageHead } from "#/lib/seo";

/** Connexion client : un email, un lien cliquable, pas de mot de passe. */
export const Route = createFileRoute("/_public/connexion")({
	// Better Auth revient ici avec `?error=…` quand le lien est invalide, expiré
	// ou déjà utilisé.
	validateSearch: (search: Record<string, unknown>): { error?: string } => ({
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	head: () =>
		buildPageHead({
			meta: {
				title: "Me connecter",
				description:
					"Retrouvez vos locations en cours, vos codes de retrait et votre historique.",
				canonicalPath: null,
				noIndex: true,
			},
		}),
	component: ConnexionPage,
});

/**
 * Un seul champ : la validation tient en une ligne, inutile d'en faire un
 * module à part comme `login.schema.ts`.
 */
const emailSchema = z.object({ email: z.email("Email invalide") });

function ConnexionPage() {
	// L'email envoyé est rappelé dans l'accusé de réception, pour que le client
	// sache lequel ouvrir si plusieurs personnes utilisent la même boîte.
	const [sentTo, setSentTo] = useState<string | null>(null);
	const { error } = Route.useSearch();

	const form = useAppForm({
		defaultValues: { email: "" },
		validators: { onChange: emailSchema },
		onSubmit: async ({ value }) => {
			// Appel par chemin et non par `authClient.signInMagicLink` : en better-auth
			// 1.6.13, le plugin magic-link ne déclare pas son endpoint sur le client
			// typé, la méthode n'existe donc pas à la compilation. `$fetch` est l'API
			// publique du client et rend le même `{ data, error }`.
			//
			// `errorCallbackURL` : un lien invalide renvoie ici au lieu de planter
			// sur `mon-compte`, où il n'y aurait aucune explication.
			const { error: requestError } = await authClient.$fetch(
				"/sign-in/magic-link",
				{
					method: "POST",
					body: {
						email: value.email,
						callbackURL: "/mon-compte",
						errorCallbackURL: "/connexion",
					},
				},
			);
			if (requestError) {
				toast.error(
					"Impossible d'envoyer le lien pour l'instant. Réessayez dans un instant.",
				);
				return;
			}
			setSentTo(value.email);
		},
	});

	return (
		<div className="page-wrap py-16">
			<div className="mx-auto max-w-md">
				{error && <LinkError error={error} />}
				{sentTo ? (
					<SentNotice email={sentTo} />
				) : (
					<>
						<header className="rise-in mb-8 space-y-3 text-center">
							<h1 className="display-title text-3xl font-semibold">
								Accéder à mes locations
							</h1>
							<p className="text-[var(--sea-ink-soft)]">
								Indiquez l'email de votre réservation : vous recevrez un lien
								pour retrouver vos locations en cours et votre historique.
							</p>
						</header>

						<section className="island-shell rounded-2xl p-6">
							<form
								onSubmit={(event) => {
									event.preventDefault();
									event.stopPropagation();
									form.handleSubmit();
								}}
							>
								<FieldGroup>
									<form.AppField name="email">
										{(field) => (
											<field.TextField
												label="Email"
												placeholder="m@example.com"
												type="email"
											/>
										)}
									</form.AppField>

									<Field>
										<form.AppForm>
											<form.SubscribeButton label="Recevoir mon lien" />
										</form.AppForm>
									</Field>
								</FieldGroup>
							</form>
						</section>

						<p className="mt-6 text-center text-xs text-[var(--sea-ink-soft)]">
							Votre compte est créé automatiquement lors de votre première
							réservation. Aucun mot de passe à choisir.
						</p>
					</>
				)}

				<div className="mt-8 text-center">
					<Button asChild variant="outline">
						<Link to={storeCanonicalPath}>Retour à l’accueil</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}

/** Accusé de réception : le lien part par mail, on ne redirige pas. */
function SentNotice({ email }: { email: string }) {
	return (
		<section className="island-shell rise-in rounded-2xl p-6 text-center">
			<span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--sea-ink)] text-white">
				<MailCheck className="size-6" aria-hidden="true" />
			</span>
			<h1 className="display-title mt-4 text-2xl font-semibold">
				Consultez votre boîte mail
			</h1>
			<p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
				Un lien de connexion a été envoyé à <strong>{email}</strong>. Il est
				valable 15 minutes et ne fonctionne qu’une fois.
			</p>
			<p className="mt-4 text-xs text-[var(--sea-ink-soft)]">
				Rien reçu ? Vérifiez les courriers indésirables, ou attendez une minute
				avant de réessayer.
			</p>
		</section>
	);
}

/** Retour d'un lien magique raté (expiré, déjà utilisé, invalide). */
const linkErrorMessages: Record<string, string> = {
	INVALID_TOKEN:
		"Ce lien n'est plus valable : il a déjà servi ou a expiré au bout de 15 minutes. Demandez-en un nouveau.",
	EXPIRED_TOKEN: "Ce lien a expiré. Demandez-en un nouveau.",
	new_user_signup_disabled:
		"Ce lien ne correspond à aucun compte ni réservation. L'email de la réservation doit être le même, sans faute de frappe.",
};

function LinkError({ error }: { error: string }) {
	return (
		<section
			role="alert"
			className="mb-8 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
		>
			<TriangleAlert
				className="mt-0.5 size-5 shrink-0 text-destructive"
				aria-hidden="true"
			/>
			<p className="m-0">
				{linkErrorMessages[error] ??
					"Ce lien n'a pas pu être validé. Demandez-en un nouveau."}
			</p>
		</section>
	);
}
