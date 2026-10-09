// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { EditUserRoleDialog } from "#/components/dialogs/EditUserRoleDialog";
import { closeDialog, dialogStore, openDialog } from "#/stores/dialog.store";

test("openDialog met à jour le store", () => {
	openDialog("editUserRole", {
		userId: "u1",
		userName: "Alice",
		currentRole: "manager",
		onConfirm: () => {},
	});
	expect(dialogStore.state.openDialog).toBe("editUserRole");
	closeDialog();
	expect(dialogStore.state.openDialog).toBeNull();
});

test("EditUserRoleDialog s'ouvre sur le rôle courant du membre", async () => {
	render(<EditUserRoleDialog />);
	expect(screen.queryByText(/Modifier le rôle de/)).toBeNull();

	openDialog("editUserRole", {
		userId: "u1",
		userName: "Alice",
		currentRole: "admin",
		onConfirm: () => {},
	});
	expect(await screen.findByText(/Modifier le rôle de Alice/)).toBeTruthy();
	// Le Select doit pré-sélectionner le rôle réel (« admin »), pas « manager ».
	expect(screen.getByText("Administrateur")).toBeTruthy();
	closeDialog();
});
