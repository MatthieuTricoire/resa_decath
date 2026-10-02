import { useQueryClient } from "@tanstack/react-query";
import { useSelector } from "@tanstack/react-store";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import type { EditCategoryData } from "#/stores/dialog.store";
import { closeDialog, dialogStore } from "#/stores/dialog.store";
import { createCategory, updateCategory } from "../queries";
import { queryKeys } from "../query-keys";

export function EditCategoryDialog() {
	const queryClient = useQueryClient();

	const isOpen = useSelector(
		dialogStore,
		(s) => s.openDialog === "editCategory",
	);
	const data = useSelector(dialogStore, (s) =>
		s.openDialog === "editCategory" ? (s.data as EditCategoryData) : null,
	);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const isEditing = Boolean(data?.categoryId);

	useEffect(() => {
		if (data) {
			setName(data.currentName ?? "");
			setDescription(data.currentDescription ?? "");
		} else {
			setName("");
			setDescription("");
		}
	}, [data]);

	const handleSave = async () => {
		const trimmedName = name.trim();
		if (!trimmedName) {
			toast.error("Le nom ne peut pas être vide.");
			return;
		}

		try {
			setIsSubmitting(true);
			if (isEditing && data?.categoryId) {
				await updateCategory({
					data: {
						id: data.categoryId,
						name: trimmedName,
						description: description.trim() || null,
					},
				});
				toast.success("Catégorie modifiée avec succès.");
			} else {
				await createCategory({
					data: {
						name: trimmedName,
						description: description.trim() || null,
					},
				});
				toast.success("Catégorie créée avec succès.");
			}

			queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
			closeDialog();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Une erreur est survenue lors de l'enregistrement.",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) closeDialog();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Modifier la catégorie" : "Ajouter une catégorie"}
					</DialogTitle>
				</DialogHeader>

				<div className="grid gap-4 py-2">
					<div className="grid gap-2">
						<Label htmlFor="category-name">Nom</Label>
						<Input
							id="category-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Nom de la catégorie"
							autoFocus
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="category-description">Description</Label>
						<Textarea
							id="category-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Description courte affichée sur la carte de la page d'accueil"
							rows={3}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={closeDialog}
						disabled={isSubmitting}
					>
						Annuler
					</Button>
					<Button onClick={handleSave} disabled={isSubmitting}>
						{isSubmitting
							? "Enregistrement..."
							: isEditing
								? "Enregistrer"
								: "Créer"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
