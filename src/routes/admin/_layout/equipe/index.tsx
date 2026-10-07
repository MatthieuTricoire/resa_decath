import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import type { CreateTeamAccountFormData } from "#/features/auth/create-team-account.schema";
import { createTeamAccountSchema } from "#/features/auth/create-team-account.schema";
import { getDashboardSession } from "#/features/auth/queries";
import { authClient } from "#/lib/auth-client";

const TEAM_QUERY_KEY = ["equipe"] as const;

type TeamMember = {
	id: string;
	name: string;
	email: string;
	role: "admin" | "manager";
};

const ROLE_LABELS: Record<TeamMember["role"], string> = {
	admin: "Administrateur",
	manager: "Gérant",
};

/**
 * La liste des membres passe par l'API admin du plugin better-auth (déjà
 * montée en prod, mêmes permissions que cet écran) : pas de nouvelle
 * `createServerFn`, et la création d'un compte officie du même code que le
 * plugin — hash du mot de passe et ligne `account` `credential` inclus.
 */
async function fetchTeamMembers(): Promise<TeamMember[]> {
	const { data, error } = await authClient.admin.listUsers({
		query: { limit: 100 },
	});
	if (error) {
		throw new Error(error.message);
	}
	return (data?.users ?? [])
		.filter((user) => user.role === "admin" || user.role === "manager")
		.map((user) => ({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role as TeamMember["role"],
		}))
		.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** Traduction des codes d'erreur renvoyés par /admin/create-user. */
function mapCreateError(error: unknown): string {
	if (error && typeof error === "object" && "code" in error) {
		const code = (error as { code?: unknown }).code;
		if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
			return "Un compte avec cet email existe déjà.";
		}
		if (code === "INVALID_EMAIL") {
			return "Email invalide.";
		}
		if (code === "YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS") {
			return "Vous n'avez pas le droit de créer des comptes.";
		}
	}
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return "Une erreur est survenue lors de la création du compte.";
}

export const Route = createFileRoute("/admin/_layout/equipe/")({
	loader: async () => {
		const session = await getDashboardSession();
		// La création de comptes admin/gérant est réservée aux admins : l'API
		// better-auth refuserait un gérant, on coupe en amont.
		if (session.user.role !== "admin") {
			throw redirect({ to: "/admin" });
		}
		return { user: session.user };
	},
	component: RouteComponent,
});

function RouteComponent() {
	const queryClient = useQueryClient();
	const { user } = Route.useLoaderData();

	const { data: team, isPending } = useQuery({
		queryKey: TEAM_QUERY_KEY,
		queryFn: fetchTeamMembers,
	});

	const mutation = useMutation({
		mutationFn: async (values: CreateTeamAccountFormData) => {
			const { name, email, password, role } = values;
			const { data, error } = await authClient.admin.createUser({
				name,
				email,
				password,
				// Seules les valeurs "admin" (défaut du plugin) et "manager" sont
				// proposées. Le schéma serveur accepte toute chaîne et la stocke
				// telle quelle ; le type client est simplement plus étroit car
				// "manager" n'est pas dans les `adminRoles` du plugin — l'ajouter
				// révèlerait au contraire les endpoints admin au gérant.
				role: role as "admin",
			});
			if (error) {
				throw error;
			}
			return data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
		},
	});

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			role: "manager" as "admin" | "manager",
			password: "",
			confirmPassword: "",
		},
		validators: {
			onSubmit: createTeamAccountSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				await mutation.mutateAsync(value);
				form.reset();
				toast.success(
					`Compte ${ROLE_LABELS[value.role]} créé : ${value.email}.`,
				);
			} catch (error) {
				toast.error(mapCreateError(error));
			}
		},
	});

	return (
		<div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 px-4 py-6 md:gap-10 md:py-8 lg:px-6">
			<div>
				<h2 className="text-lg font-semibold">Équipe</h2>
				<p className="text-sm text-muted-foreground">
					Créez les comptes d'accès au dashboard (administrateur ou gérant).
					Chaque membre peut ensuite changer son mot de passe depuis « Mon
					compte ».
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Ajouter un membre</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
						className="flex flex-col gap-4"
					>
						<div className="grid gap-4 sm:grid-cols-3">
							<form.Field
								name="name"
								// biome-ignore lint/correctness/noChildrenProp: API TanStack Form (render prop)
								children={(field) => (
									<div className="flex flex-col gap-2">
										<Label htmlFor={field.name}>Nom complet</Label>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="Jean Dupont"
										/>
										{field.state.meta.errors.length > 0 && (
											<p className="text-sm text-destructive">
												{field.state.meta.errors.join(", ")}
											</p>
										)}
									</div>
								)}
							/>

							<form.Field
								name="email"
								// biome-ignore lint/correctness/noChildrenProp: API TanStack Form (render prop)
								children={(field) => (
									<div className="flex flex-col gap-2">
										<Label htmlFor={field.name}>Email</Label>
										<Input
											id={field.name}
											name={field.name}
											type="email"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="jean@exemple.fr"
										/>
										{field.state.meta.errors.length > 0 && (
											<p className="text-sm text-destructive">
												{field.state.meta.errors.join(", ")}
											</p>
										)}
									</div>
								)}
							/>

							<form.Field
								name="role"
								// biome-ignore lint/correctness/noChildrenProp: API TanStack Form (render prop)
								children={(field) => (
									<div className="flex flex-col gap-2">
										<Label htmlFor={field.name}>Rôle</Label>
										<Select
											value={field.state.value}
											onValueChange={(value) =>
												field.handleChange(value as "admin" | "manager")
											}
										>
											<SelectTrigger id={field.name} className="w-full">
												<SelectValue placeholder="Choisir un rôle" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="admin">Administrateur</SelectItem>
												<SelectItem value="manager">Gérant</SelectItem>
											</SelectContent>
										</Select>
										{field.state.meta.errors.length > 0 && (
											<p className="text-sm text-destructive">
												{field.state.meta.errors.join(", ")}
											</p>
										)}
									</div>
								)}
							/>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<form.Field
								name="password"
								// biome-ignore lint/correctness/noChildrenProp: API TanStack Form (render prop)
								children={(field) => (
									<div className="flex flex-col gap-2">
										<Label htmlFor={field.name}>Mot de passe</Label>
										<Input
											id={field.name}
											name={field.name}
											type="password"
											autoComplete="new-password"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
										{field.state.meta.errors.length > 0 && (
											<p className="text-sm text-destructive">
												{field.state.meta.errors.join(", ")}
											</p>
										)}
									</div>
								)}
							/>

							<form.Field
								name="confirmPassword"
								// biome-ignore lint/correctness/noChildrenProp: API TanStack Form (render prop)
								children={(field) => (
									<div className="flex flex-col gap-2">
										<Label htmlFor={field.name}>
											Confirmer le mot de passe
										</Label>
										<Input
											id={field.name}
											name={field.name}
											type="password"
											autoComplete="new-password"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
										{field.state.meta.errors.length > 0 && (
											<p className="text-sm text-destructive">
												{field.state.meta.errors.join(", ")}
											</p>
										)}
									</div>
								)}
							/>
						</div>

						<Button
							type="submit"
							disabled={mutation.isPending}
							className="self-start"
						>
							{mutation.isPending ? "Création..." : "Créer le compte"}
						</Button>
					</form>
				</CardContent>
			</Card>

			<section>
				<h3 className="mb-3 text-base font-semibold">Membres actuels</h3>
				<div className="overflow-hidden rounded-lg border">
					<Table>
						<TableHeader className="bg-muted/50">
							<TableRow>
								<TableHead>Nom</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Rôle</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isPending ? (
								<TableRow>
									<TableCell colSpan={3} className="text-center">
										Chargement...
									</TableCell>
								</TableRow>
							) : team && team.length === 0 ? (
								<TableRow>
									<TableCell colSpan={3} className="text-center">
										Aucun membre de l'équipe pour le moment.
									</TableCell>
								</TableRow>
							) : (
								(team ?? []).map((member) => (
									<TableRow key={member.id}>
										<TableCell>
											{member.name}
											{member.email === user.email ? (
												<span className="text-muted-foreground"> (vous)</span>
											) : null}
										</TableCell>
										<TableCell>{member.email}</TableCell>
										<TableCell>
											<Badge
												variant={
													member.role === "admin" ? "default" : "secondary"
												}
											>
												{ROLE_LABELS[member.role]}
											</Badge>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</section>
		</div>
	);
}
