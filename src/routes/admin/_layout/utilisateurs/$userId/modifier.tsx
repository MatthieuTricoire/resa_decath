import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ZodError, z } from "zod";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { getUserDetail, updateUser } from "#/features/users/queries";
import { queryKeys } from "#/features/users/query-keys";

export const Route = createFileRoute(
	"/admin/_layout/utilisateurs/$userId/modifier",
)({
	loader: async ({ context: { queryClient }, params: { userId } }) => {
		await queryClient.prefetchQuery({
			queryKey: queryKeys.users.detail(userId),
			queryFn: () => getUserDetail({ data: userId }),
		});
	},
	component: RouteComponent,
});

const formSchema = z.object({
	name: z.string().min(1, "Le nom est requis"),
	email: z.string().email("Email invalide"),
	phone: z.string().min(1, "Le téléphone est requis"),
	loyaltyCard: z.string(),
});

function RouteComponent() {
	const { userId } = Route.useParams();
	const router = useRouter();
	const queryClient = useQueryClient();

	const { data: user, isPending } = useQuery({
		queryKey: queryKeys.users.detail(userId),
		queryFn: () => getUserDetail({ data: userId }),
	});

	const mutation = useMutation({
		mutationFn: (values: z.infer<typeof formSchema>) =>
			updateUser({ data: { id: userId, ...values } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
			queryClient.invalidateQueries({
				queryKey: queryKeys.users.detail(userId),
			});
			toast.success("Utilisateur mis à jour");
			router.navigate({
				to: "/admin/utilisateurs/$userId",
				params: { userId },
			});
		},
		onError: (err) => {
			const message =
				err instanceof ZodError
					? err.issues.map((i) => i.message).join(", ")
					: err instanceof Error
						? err.message
						: "Erreur lors de la mise à jour";
			toast.error(message);
		},
	});

	const form = useForm({
		defaultValues: {
			name: user?.name ?? "",
			email: user?.email ?? "",
			phone: user?.phone ?? "",
			loyaltyCard: user?.loyaltyCard ?? "",
		},
		validators: {
			onSubmit: formSchema,
		},
		onSubmit: async ({ value }) => {
			mutation.mutate(value);
		},
	});

	if (isPending) {
		return <div className="text-sm text-muted-foreground">Chargement...</div>;
	}

	if (!user) {
		return (
			<div className="text-sm text-muted-foreground">
				Utilisateur introuvable.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" className="size-8" asChild>
					<a href={`/admin/utilisateurs/${userId}`}>
						<ArrowLeft className="size-4" />
					</a>
				</Button>
				<h2 className="text-lg font-semibold">Modifier {user.name}</h2>
			</div>

			<Card className="max-w-lg">
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
							{mutation.isPending ? "Enregistrement..." : "Enregistrer"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
