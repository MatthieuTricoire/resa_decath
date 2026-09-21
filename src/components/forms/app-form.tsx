import { createFormHook } from "@tanstack/react-form";
import { fieldContext, formContext } from "./app-form-context.tsx";
import { NumberField, TextArea, TextField } from "./form-input.tsx";
import { SubscribeButton } from "./form-submit-button.tsx";

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
	fieldComponents: {
		TextField,
		TextArea,
		NumberField,
	},
	formComponents: {
		SubscribeButton,
	},
	fieldContext,
	formContext,
});
