import { Button } from "../ui/button";
import { useFormContext } from "./app-form-context";

export function SubscribeButton({ label }: { label: string }) {
	const form = useFormContext();
	return (
		<form.Subscribe
			selector={(state) =>
				state.isSubmitting || !state.isValid || !state.isTouched
			}
		>
			{(isSubmittingOrInvalid) => (
				<Button variant="default" disabled={isSubmittingOrInvalid}>
					{label}
				</Button>
			)}
		</form.Subscribe>
	);
}
