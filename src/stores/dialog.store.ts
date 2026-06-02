import { createStore } from "@tanstack/react-store";

type ConfirmDeleteData = {
	title: string;
	description: string;
	onConfirm: () => void | Promise<void>;
};

type DialogData = {
	confirmDelete: ConfirmDeleteData;
	createUser: Record<string, never>;
	// ...
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
