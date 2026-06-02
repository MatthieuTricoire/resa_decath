import { useSelector } from "@tanstack/react-store";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { closeDialog, dialogStore } from "#/stores/dialog.store";

export function CreateUserDialog() {
	const isOpen = useSelector(dialogStore, (s) => s.openDialog === "createUser");

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Créer un utilisateur</DialogTitle>
				</DialogHeader>
			</DialogContent>
		</Dialog>
	);
}
