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
import type { EditCategoryData } from "#/stores/dialog.store";
import { closeDialog, dialogStore } from "#/stores/dialog.store";
import { updateCategory } from "../queries";
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

	useEffect(() => {
		if (data) {
			setName(data.currentName);
		}
	}, [data]);

	const handleSave = async () => {
		if (!name.trim()) {
			toast.error("Le nom ne peut pas être vide.");
			return;
		}

		if (!data) return;

		await updateCategory({
			data: { id: data.categoryId, name: name.trim() },
		});

		queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
		toast.success("Catégorie renommée avec succès.");
		closeDialog();
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
					<DialogTitle>Renommer la catégorie</DialogTitle>
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
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={closeDialog}>
						Annuler
					</Button>
					<Button onClick={handleSave}>Enregistrer</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
