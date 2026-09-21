import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ZodError, z } from "zod";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { createUser } from "#/features/users/queries";
import { queryKeys } from "#/features/users/query-keys";

export const Route = createFileRoute("/admin/_layout/utilisateurs/ajouter")({
	component: RouteComponent,
});

const formSchema = z.object({
	name: z.string().min(1, "Le nom est requis"),
	email: z.string().email("Email invalide"),
	phone: z.string().min(1, "Le téléphone est requis"),
	loyaltyCard: z.string(),
});

function RouteComponent() {
	const router = useRouter();
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: (values: z.infer<typeof formSchema>) =>
			createUser({ data: values }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
			toast.success("Utilisateur créé avec succès");
			router.navigate({ to: "/admin/utilisateurs" });
		},
		onError: (err) => {
			const message =
				err instanceof ZodError
					? err.issues.map((i) => i.message).join(", ")
					: err instanceof Error
						? err.message
						: "Erreur lors de la création";
			toast.error(message);
		},
	});

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			phone: "",
			loyaltyCard: "",
		},
		validators: {
			onSubmit: formSchema,
		},
		onSubmit: async ({ value }) => {
			mutation.mutate(value);
		},
	});

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" className="size-8" asChild>
					<a href="/admin/utilisateurs">
						<ArrowLeft className="size-4" />
					</a>
				</Button>
				<h2 className="text-lg font-semibold">Ajouter un utilisateur</h2>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Informations</CardTitle>
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
						<form.Field
							name="name"
							// biome-ignore lint/correctness/noChildrenProp: API TanStack Form (render prop)
							children={(field) => (
								<div className="flex flex-col gap-2">
									<Label htmlFor={field.name}>Nom</Label>
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
							name="phone"
							// biome-ignore lint/correctness/noChildrenProp: API TanStack Form (render prop)
							children={(field) => (
								<div className="flex flex-col gap-2">
									<Label htmlFor={field.name}>Téléphone</Label>
									<Input
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="06 12 34 56 78"
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
							name="loyaltyCard"
							// biome-ignore lint/correctness/noChildrenProp: API TanStack Form (render prop)
							children={(field) => (
								<div className="flex flex-col gap-2">
									<Label htmlFor={field.name}>
										Carte Decathlon (optionnel)
									</Label>
									<Input
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="123456789"
									/>
									{field.state.meta.errors.length > 0 && (
										<p className="text-sm text-destructive">
											{field.state.meta.errors.join(", ")}
										</p>
									)}
								</div>
							)}
						/>

						<Button
							type="submit"
							disabled={mutation.isPending}
							className="self-start"
						>
							{mutation.isPending ? "Création..." : "Créer l'utilisateur"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
