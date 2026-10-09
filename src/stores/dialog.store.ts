import { createStore } from "@tanstack/react-store";

export type ConfirmDeleteData = {
	title: string;
	description: string;
	/** Libellé du bouton de confirmation ; « Supprimer » par défaut. */
	confirmLabel?: string;
	onConfirm: () => void | Promise<void>;
};

export type EditCategoryData = {
	categoryId?: string;
	currentName?: string;
	currentDescription?: string | null;
};

/**
 * Une action de comptoir sur une réservation : retrait, retour, annulation.
 *
 * La dialogue ne déclenche rien par elle-même — elle affiche le libellé adapté
 * au `kind` et remonte le choix de l'agent via `onConfirm`. C'est le seul
 * endroit où une action du tableau du jour se confirme : le clic direct sur le
 * bouton n'ouvre plus que cette dialogue.
 */
export type ReservationActionData = {
	kind: "pickup" | "return" | "cancel";
	clientName: string;
	/**
	 * Pré-coche « Client non présenté » — un retrait déjà dépassé est le cas
	 * d'école d'une non-présentation, mais l'agent garde la main.
	 */
	defaultNoShow?: boolean;
	/** `noShow` n'est porteur que pour `kind: "cancel"`. */
	onConfirm: (noShow: boolean) => void | Promise<void>;
};

export type EditUserRoleData = {
	userId: string;
	userName: string;
	currentRole: "admin" | "manager";
	onConfirm: (role: "admin" | "manager") => void | Promise<void>;
};

type DialogData = {
	confirmDelete: ConfirmDeleteData;
	createUser: Record<string, never>;
	editCategory: EditCategoryData;
	reservationAction: ReservationActionData;
	editUserRole: EditUserRoleData;
};

type DialogId = keyof DialogData;

type DialogState = {
	openDialog: DialogId | null;
	data: Partial<DialogData[DialogId]> | null;
};

export const dialogStore = createStore<DialogState>({
	openDialog: null,
	data: null,
});

export const openDialog = <T extends DialogId>(id: T, data: DialogData[T]) =>
	dialogStore.setState(() => ({ openDialog: id, data }));

export const closeDialog = () =>
	dialogStore.setState(() => ({ openDialog: null, data: null }));
