import { IconCalendar, IconKey, IconMail, IconUser } from "@tabler/icons-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { format } from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "#/components/forms/app-form";
import { SiteHeader } from "#/components/site-header";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
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

function getInitials(name: string): string {
	return (
		name
			.trim()
			.split(/\s+/)
			.map((part) => part[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "U"
	);
}

function formatRole(role?: string): string {
	switch (role) {
		case "admin":
			return "Administrateur";
		case "manager":
			return "Gérant";
		case "user":
			return "Utilisateur";
		default:
			return role || "Membre";
	}
}

const profileSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, "Le nom doit comporter au moins 2 caractères")
		.max(100, "Le nom ne doit pas dépasser 100 caractères"),
});

function ProfileForm({ user }: { user: { name: string; email: string } }) {
	const router = useRouter();

	const form = useAppForm({
		defaultValues: {
			name: user.name,
		},
		validators: {
			onChange: profileSchema,
		},
		onSubmit: async ({ value }) => {
			const { error } = await authClient.updateUser({
				name: value.name.trim(),
			});

			if (error) {
				toast.error(`Une erreur est survenue : ${error.message}`);
				return;
			}

			toast.success("Profil mis à jour avec succès.");
			await router.invalidate();
		},
	});

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="flex flex-col gap-6"
		>
			<FieldGroup>
				<form.AppField name="name">
					{(field) => (
						<field.TextField
							label="Nom d'affichage"
							placeholder="Prénom et nom"
							description="Votre nom visible dans l'équipe et sur le tableau de bord."
						/>
					)}
				</form.AppField>

				<Field>
					<FieldLabel htmlFor="email-readonly">Adresse email</FieldLabel>
					<div className="relative">
						<Input
							id="email-readonly"
							type="email"
							value={user.email}
							disabled
							className="bg-muted text-muted-foreground cursor-not-allowed pl-9"
						/>
						<IconMail
							className="absolute left-3 top-2.5 size-4 text-muted-foreground"
							aria-hidden="true"
						/>
					</div>
					<p className="text-xs text-muted-foreground mt-1.5">
						L'adresse email est utilisée pour la connexion et
						l'authentification.
					</p>
				</Field>

				<Field>
					<form.AppForm>
						<form.SubscribeButton label="Enregistrer les modifications" />
					</form.AppForm>
				</Field>
			</FieldGroup>
		</form>
	);
}

function PasswordForm() {
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
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="flex flex-col gap-6"
		>
			<FieldGroup>
				<form.AppField name="currentPassword">
					{(field) => (
						<field.TextField
							label="Mot de passe actuel"
							type="password"
							placeholder="••••••••"
						/>
					)}
				</form.AppField>

				<form.AppField name="newPassword">
					{(field) => (
						<field.TextField
							label="Nouveau mot de passe"
							type="password"
							placeholder="••••••••"
							description="Au moins 8 caractères."
						/>
					)}
				</form.AppField>

				<form.AppField name="confirmPassword">
					{(field) => (
						<field.TextField
							label="Confirmer le nouveau mot de passe"
							type="password"
							placeholder="••••••••"
						/>
					)}
				</form.AppField>

				<Field>
					<form.AppForm>
						<form.SubscribeButton label="Mettre à jour le mot de passe" />
					</form.AppForm>
				</Field>
			</FieldGroup>
		</form>
	);
}

function RouteComponent() {
	const { user } = Route.useLoaderData();
	const initials = getInitials(user.name);
	const roleLabel = formatRole(user.role);
	const memberSince = user.createdAt
		? format(new Date(user.createdAt), "d MMMM yyyy", { locale: frLocale })
		: null;

	return (
		<>
			<SiteHeader title="Mon compte" />
			<div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-8 px-4 py-6 md:gap-10 md:py-8 lg:px-6">
				{/* Bannière de profil */}
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border bg-card p-6 shadow-sm">
					<div className="flex items-center gap-4">
						<Avatar className="size-16 rounded-xl text-lg">
							<AvatarImage src={user.image ?? ""} alt={user.name} />
							<AvatarFallback className="rounded-xl font-semibold">
								{initials}
							</AvatarFallback>
						</Avatar>
						<div className="space-y-1">
							<div className="flex items-center gap-2">
								<h2 className="text-xl font-bold">{user.name}</h2>
								<Badge variant="secondary" className="font-medium">
									{roleLabel}
								</Badge>
							</div>
							<p className="text-sm text-muted-foreground">{user.email}</p>
							{memberSince && (
								<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
									<IconCalendar className="size-3.5" aria-hidden="true" />
									<span>Membre de l'équipe depuis le {memberSince}</span>
								</p>
							)}
						</div>
					</div>
				</div>

				{/* Grille des formulaires */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
					{/* Carte Profil */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<IconUser className="size-4 text-primary" aria-hidden="true" />
								Informations personnelles
							</CardTitle>
							<CardDescription>
								Gérez votre nom complet visible dans l'équipe et sur le tableau
								de bord.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<ProfileForm key={user.name} user={user} />
						</CardContent>
					</Card>

					{/* Carte Sécurité */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<IconKey className="size-4 text-primary" aria-hidden="true" />
								Sécurité du compte
							</CardTitle>
							<CardDescription>
								Modifiez votre mot de passe pour sécuriser votre accès. Les
								autres sessions seront déconnectées.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<PasswordForm />
						</CardContent>
					</Card>
				</div>
			</div>
		</>
	);
}
