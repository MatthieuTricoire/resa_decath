import { useSelector } from "@tanstack/react-store";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import type { EditUserRoleData } from "#/stores/dialog.store";
import { closeDialog, dialogStore } from "#/stores/dialog.store";

export function EditUserRoleDialog() {
	const isOpen = useSelector(
		dialogStore,
		(s) => s.openDialog === "editUserRole",
	);
	const data = useSelector(dialogStore, (s) =>
		s.openDialog === "editUserRole" ? (s.data as EditUserRoleData) : null,
	);

	const [role, setRole] = useState<"admin" | "manager">("manager");
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Chaque ouverture repart du rôle réel du membre : sans ça, la sélection
	// garderait la dernière valeur choisie (ou « Gérant » au premier affichage)
	// et un enregistrement sans changement ne modifie rien.
	useEffect(() => {
		if (isOpen && data) {
			setRole(data.currentRole);
		}
	}, [isOpen, data]);

	const handleSave = async () => {
		if (!data) return;

		try {
			setIsSubmitting(true);
			// Le succès est annoncé par l'appelant (`onConfirm`), qui connaît le
			// membre concerné ; ici on ne signale que l'échec éventuel.
			await data.onConfirm(role);
			closeDialog();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Une erreur est survenue lors de la mise à jour du rôle.",
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
						Modifier le rôle de {data?.userName || "cet utilisateur"}
					</DialogTitle>
					<DialogDescription>
						Sélectionnez le nouveau rôle pour cet utilisateur
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="user-role">Nouveau rôle</Label>
						<Select
							value={role}
							onValueChange={(value) => setRole(value as "admin" | "manager")}
						>
							<SelectTrigger id="user-role" className="w-full">
								<SelectValue placeholder="Choisir un rôle" />
							</SelectTrigger>
							<SelectContent position="popper">
								<SelectItem value="admin">Administrateur</SelectItem>
								<SelectItem value="manager">Gérant</SelectItem>
							</SelectContent>
						</Select>
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
						{isSubmitting ? "Mise à jour..." : "Enregistrer les changements"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
