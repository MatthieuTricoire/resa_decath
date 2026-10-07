import { useSelector } from "@tanstack/react-store";
import { useEffect, useState } from "react";
import type { ReservationActionData } from "#/stores/dialog.store";
import { closeDialog, dialogStore } from "#/stores/dialog.store";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";

/** Libellés d'une action de comptoir, par type d'action. */
const COPY: Record<
	ReservationActionData["kind"],
	{
		title: string;
		confirmLabel: string;
		destructive?: boolean;
		noShow?: boolean;
	}
> = {
	pickup: {
		title: "Marquer la réservation comme récupérée ?",
		confirmLabel: "Marquer comme récupérée",
	},
	return: {
		title: "Marquer la réservation comme retournée ?",
		confirmLabel: "Marquer comme retournée",
	},
	cancel: {
		title: "Annuler la réservation ?",
		confirmLabel: "Annuler la réservation",
		destructive: true,
		noShow: true,
	},
};

function description(kind: ReservationActionData["kind"], clientName: string) {
	if (kind === "pickup") {
		return `${clientName} récupère le matériel : la réservation passe en « En cours » et quitte le tableau du jour.`;
	}
	if (kind === "return") {
		return `${clientName} rend le matériel : la location est close et les exemplaires repartent en stock disponible.`;
	}
	return `La réservation de ${clientName} est annulée et le matériel bloqué est libéré. Si le client n'est simplement pas venu, cochez la case ci-dessous : la non-présentation restera attachée à son historique.`;
}

/**
 * Confirmation d'une action de comptoir (retrait, retour, annulation).
 *
 * Aucune action du tableau du jour ne s'exécute plus au premier clic : cette
 * dialogue est l'unique intermédiaire, comme `ConfirmDeleteDialog` l'est pour
 * les suppressions. Elle porte aussi le seul endroit où l'on flage un no-show,
 * une décision qui se prend au moment d'annuler une commande jamais venue.
 */
export function ReservationActionDialog() {
	const isOpen = useSelector(
		dialogStore,
		(s) => s.openDialog === "reservationAction",
	);
	const data = useSelector(dialogStore, (s) =>
		s.openDialog === "reservationAction"
			? (s.data as ReservationActionData)
			: null,
	);

	const [noShow, setNoShow] = useState(false);

	// Chaque ouverture repart du pré-cochage du moment : un retrait dépassé
	// hier ne doit pas cocher la case sur une annulation décidée aujourd'hui.
	useEffect(() => {
		if (isOpen) setNoShow(Boolean(data?.defaultNoShow));
	}, [isOpen, data?.defaultNoShow]);

	if (!data) return null;

	const copy = COPY[data.kind];

	const handleConfirm = async () => {
		try {
			await data.onConfirm(noShow);
		} catch {
			// L'erreur est déjà remontée en toast par la mutation. La dialogue
			// reste ouverte : l'agent peut réessayer sans reconstituer l'action.
			return;
		}
		closeDialog();
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{copy.title}</DialogTitle>
					<DialogDescription>
						{description(data.kind, data.clientName)}
					</DialogDescription>
				</DialogHeader>

				{copy.noShow && (
					<div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 p-3">
						<Checkbox
							id="no-show"
							checked={noShow}
							onCheckedChange={(checked) => setNoShow(checked === true)}
						/>
						<div className="grid gap-1.5">
							<Label htmlFor="no-show" className="font-medium">
								Client non présenté
							</Label>
							<p className="text-xs text-muted-foreground">
								Le retrait prévu n'a pas eu lieu : la réservation est annulée et
								portée comme non-présentation dans l'historique du client.
							</p>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={closeDialog}>
						Retour
					</Button>
					<Button
						variant={copy.destructive ? "destructive" : "default"}
						onClick={handleConfirm}
					>
						{copy.confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
