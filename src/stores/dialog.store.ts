import { createStore } from "@tanstack/react-store";

export type ConfirmDeleteData = {
	title: string;
	description: string;
	onConfirm: () => void | Promise<void>;
};

export type EditCategoryData = {
	categoryId: string;
	currentName: string;
};

type DialogData = {
	confirmDelete: ConfirmDeleteData;
	createUser: Record<string, never>;
	editCategory: EditCategoryData;
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
