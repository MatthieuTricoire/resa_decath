import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "#/components/dialogs/ConfirmDeleteDialog";
import { EditUserRoleDialog } from "#/components/dialogs/EditUserRoleDialog";
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
import type { InviteTeamMemberFormData } from "#/features/auth/create-team-account.schema";
import { inviteTeamMemberSchema } from "#/features/auth/create-team-account.schema";
import { getDashboardSession } from "#/features/auth/queries";
import type { TeamMemberItem } from "#/features/auth/team.queries";
import {
	getTeamMembers,
	inviteTeamMember,
	resendTeamInvitation,
} from "#/features/auth/team.queries";
import { deleteUser } from "#/features/users/queries";
import { authClient } from "#/lib/auth-client";
import { openDialog } from "#/stores/dialog.store";

const TEAM_QUERY_KEY = ["equipe"] as const;

const ROLE_LABELS: Record<TeamMemberItem["role"], string> = {
	admin: "Administrateur",
	manager: "Gérant",
};

export const Route = createFileRoute("/admin/_layout/equipe/")({
	loader: async () => {
		const session = await getDashboardSession();
		// La gestion de l'équipe est réservée aux admins.
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
		queryFn: () => getTeamMembers(),
	});

	const inviteMutation = useMutation({
		mutationFn: async (values: InviteTeamMemberFormData) => {
			return await inviteTeamMember({ data: values });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
		},
	});

	const resendMutation = useMutation({
		mutationFn: async (userId: string) => {
			return await resendTeamInvitation({ data: { userId } });
		},
	});

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			role: "manager" as "admin" | "manager",
		},
		validators: {
			onSubmit: inviteTeamMemberSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				await inviteMutation.mutateAsync(value);
				form.reset();
				toast.success(
					`Invitation envoyée à ${value.email} (${ROLE_LABELS[value.role]}).`,
				);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Une erreur est survenue lors de l'envoi de l'invitation.",
				);
			}
		},
	});

	return (
		<div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 px-4 py-6 md:gap-10 md:py-8 lg:px-6">
			<div>
				<h2 className="text-lg font-semibold">Équipe</h2>
				<p className="text-sm text-muted-foreground">
					Invitez les membres d'accès au dashboard (administrateur ou gérant).
					Un email leur sera envoyé avec un lien pour qu'ils définissent
					eux-mêmes leur mot de passe.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Inviter un membre</CardTitle>
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
											<SelectContent position="popper">
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

						<p className="text-xs text-muted-foreground">
							Un email contenant un lien d'activation sécurisé sera
							automatiquement envoyé à cette adresse pour lui permettre de
							définir son mot de passe (lien valable 48h).
						</p>

						<Button
							type="submit"
							disabled={inviteMutation.isPending}
							className="self-start"
						>
							{inviteMutation.isPending ? "Envoi..." : "Inviter le membre"}
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
								<TableHead>Statut</TableHead>
								<TableHead className="w-24 text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isPending ? (
								<TableRow>
									<TableCell colSpan={5} className="text-center">
										Chargement...
									</TableCell>
								</TableRow>
							) : team && team.length === 0 ? (
								<TableRow>
									<TableCell colSpan={5} className="text-center">
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
										<TableCell>
											{member.hasPassword ? (
												<Badge
													variant="outline"
													className="border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
												>
													Actif
												</Badge>
											) : (
												<Badge
													variant="outline"
													className="border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
												>
													En attente d'activation
												</Badge>
											)}
										</TableCell>
										<TableCell className="whitespace-nowrap">
											<div className="flex items-center justify-end gap-2">
												{!member.hasPassword && member.id !== user.id && (
													<Button
														variant="outline"
														size="sm"
														disabled={resendMutation.isPending}
														onClick={async () => {
															try {
																await resendMutation.mutateAsync(member.id);
																toast.success(
																	`Invitation renvoyée à ${member.email}.`,
																);
															} catch (error) {
																toast.error(
																	error instanceof Error
																		? error.message
																		: "Impossible de renvoyer l'invitation.",
																);
															}
														}}
													>
														Renvoyer l'invitation
													</Button>
												)}
												{member.id !== user.id && (
													<Button
														variant="outline"
														size="sm"
														onClick={() => {
															openDialog("editUserRole", {
																userId: member.id,
																userName: member.name,
																currentRole: member.role,
																onConfirm: async (newRole) => {
																	const { error } =
																		await authClient.admin.updateUser({
																			userId: member.id,
																			data: {
																				role: newRole,
																			},
																		});
																	if (error) {
																		throw new Error(
																			error.message ||
																				"Impossible de modifier le rôle.",
																		);
																	}
																	toast.success(
																		`Rôle de ${member.name} mis à jour avec succès.`,
																	);
																	queryClient.invalidateQueries({
																		queryKey: TEAM_QUERY_KEY,
																	});
																},
															});
														}}
													>
														Modifier le rôle
													</Button>
												)}
												{member.id !== user.id && (
													<Button
														variant="destructive"
														size="sm"
														onClick={() => {
															openDialog("confirmDelete", {
																title: "Supprimer l'utilisateur",
																description: `Voulez-vous vraiment supprimer le compte de ${member.name} ? Cette action est irréversible.`,
																confirmLabel: "Supprimer définitivement",
																onConfirm: async () => {
																	try {
																		await deleteUser({
																			data: { id: member.id },
																		});
																		toast.success(
																			`Compte de ${member.name} supprimé avec succès.`,
																		);
																		queryClient.invalidateQueries({
																			queryKey: TEAM_QUERY_KEY,
																		});
																	} catch (error) {
																		toast.error(
																			error instanceof Error
																				? error.message
																				: "Une erreur est survenue lors de la suppression de l'utilisateur.",
																		);
																	}
																},
															});
														}}
													>
														Supprimer
													</Button>
												)}
											</div>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</section>

			{/* Dialogs globales du store : modification de rôle et confirmation de
			    suppression — les deux boutons d'action de chaque ligne les ouvrent. */}
			<EditUserRoleDialog />
			<ConfirmDeleteDialog />
		</div>
	);
}
