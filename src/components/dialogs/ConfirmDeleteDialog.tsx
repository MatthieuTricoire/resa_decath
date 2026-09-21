import { useSelector } from "@tanstack/react-store";
import type { ConfirmDeleteData } from "#/stores/dialog.store";
import { closeDialog, dialogStore } from "#/stores/dialog.store";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";

export function ConfirmDeleteDialog() {
	const isOpen = useSelector(
		dialogStore,
		(s) => s.openDialog === "confirmDelete",
	);
	const data = useSelector(dialogStore, (s) =>
		s.openDialog === "confirmDelete" ? (s.data as ConfirmDeleteData) : null,
	);

	const handleConfirm = async () => {
		await data?.onConfirm?.();
		closeDialog();
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{data?.title ?? "Confirmer la suppression"}</DialogTitle>
					<DialogDescription>{data?.description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={closeDialog}>
						Annuler
					</Button>
					<Button variant="destructive" onClick={handleConfirm}>
						Supprimer
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
