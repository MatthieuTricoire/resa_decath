import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { ConfirmDeleteDialog } from "#/components/dialogs/ConfirmDeleteDialog";
import { EditCategoryDialog } from "#/features/equipements/components/EditCategoryDialog";
import { deleteCategory, getCategories } from "#/features/equipements/queries";
import { queryKeys } from "#/features/equipements/query-keys";
import { openDialog } from "#/stores/dialog.store";

export const Route = createFileRoute("/admin/_layout/reglages/categories")({
	loader: async ({ context: { queryClient } }) => {
		await queryClient.prefetchQuery({
			queryKey: queryKeys.categories.all,
			queryFn: () => getCategories(),
		});
	},
	component: RouteComponent,
});

function RouteComponent() {
	const queryClient = useQueryClient();
	const { data: categories, isPending } = useQuery({
		queryKey: queryKeys.categories.all,
		queryFn: () => getCategories(),
	});

	return (
		<div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 px-4 py-6 md:gap-10 md:py-8 lg:px-6">
			<div className="flex justify-between items-center">
				<div>
					<h2 className="text-lg font-semibold">Catégories d'équipements</h2>
					<p className="text-sm text-muted-foreground">
						Gérez les catégories disponibles pour classer vos équipements
					</p>
				</div>
				<Button size="sm" onClick={() => openDialog("editCategory", {})}>
					<Plus className="mr-2 size-4" /> Ajouter
				</Button>
			</div>

			{isPending ? (
				<div className="text-sm text-muted-foreground">Chargement...</div>
			) : (
				<ul className="space-y-2">
					{categories?.map((cat) => (
						<li
							key={cat.id}
							className="flex items-center justify-between rounded-md border px-4 py-3"
						>
							<div className="flex flex-col gap-0.5">
								<span className="font-medium">{cat.name}</span>
								{cat.description && (
									<p className="text-sm text-muted-foreground">
										{cat.description}
									</p>
								)}
							</div>
							<div className="flex gap-2">
								<Button
									variant="ghost"
									size="icon"
									onClick={() =>
										openDialog("editCategory", {
											categoryId: cat.id,
											currentName: cat.name,
											currentDescription: cat.description,
										})
									}
								>
									<Pencil className="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="text-destructive"
									onClick={() =>
										openDialog("confirmDelete", {
											title: "Supprimer la catégorie",
											description: `Êtes-vous sûr de vouloir supprimer « ${cat.name} » ?`,
											onConfirm: async () => {
												await deleteCategory({ data: cat.id });
												queryClient.invalidateQueries({
													queryKey: queryKeys.categories.all,
												});
												toast.success("Catégorie supprimée");
											},
										})
									}
								>
									<Trash2 className="size-4" />
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
			<ConfirmDeleteDialog />
			<EditCategoryDialog />
		</div>
	);
}
