import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "#/components/dialogs/ConfirmDeleteDialog";
import { Button } from "#/components/ui/button";
import { EditCategoryDialog } from "#/features/equipements/components/EditCategoryDialog";
import { deleteCategory, getCategories } from "#/features/equipements/queries";
import { queryKeys } from "#/features/equipements/query-keys";
import { openDialog } from "#/stores/dialog.store";

export const Route = createFileRoute("/admin/_layout/equipements/categories")({
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

	if (isPending) {
		return <div className="text-sm text-muted-foreground">Chargement...</div>;
	}

	return (
		<div>
			<h2 className="text-lg font-semibold mb-4">Catégories</h2>
			<ul className="space-y-2">
				{categories?.map((cat) => (
					<li
						key={cat.id}
						className="flex items-center justify-between rounded-md border px-4 py-3"
					>
						<span className="text-sm">{cat.name}</span>
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
								onClick={() =>
									openDialog("editCategory", {
										categoryId: cat.id,
										currentName: cat.name,
									})
								}
							>
								<Pencil className="size-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								className="size-8 text-destructive"
								onClick={() =>
									openDialog("confirmDelete", {
										title: "Supprimer la catégorie",
										description: `Êtes-vous sûr de vouloir supprimer « ${cat.name} » ? Cette action est irréversible.`,
										onConfirm: async () => {
											await deleteCategory({ data: cat.id });
											queryClient.invalidateQueries({
												queryKey: queryKeys.categories.all,
											});
											toast.success("Catégorie supprimée avec succès.");
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
			<ConfirmDeleteDialog />
			<EditCategoryDialog />
		</div>
	);
}
