import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { PasswordInput } from "../ui/password-input";
import { Textarea } from "../ui/textarea";
import { useFieldContext } from "./app-form-context";
import { useFieldError } from "./use-field-error";

export function TextField({
	label,
	placeholder,
	type,
	description,
	onChange,
}: {
	label: string;
	placeholder?: string;
	description?: string;
	type?: React.HTMLInputTypeAttribute;
	onChange?: (value: string) => void;
}) {
	const field = useFieldContext<string>();
	const { errors, showError, focusProps } = useFieldError<string>();

	const handleInput = (value: string) => {
		field.handleChange(value);
		onChange?.(value);
	};

	return (
		<Field data-invalid={showError}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			{type === "password" ? (
				<PasswordInput
					id={field.name}
					value={field.state.value}
					placeholder={placeholder}
					{...focusProps}
					onChange={(e) => handleInput(e.target.value)}
					aria-invalid={showError}
					autoComplete="off"
				/>
			) : (
				<Input
					id={field.name}
					type={type}
					value={field.state.value}
					placeholder={placeholder}
					{...focusProps}
					onChange={(e) => handleInput(e.target.value)}
					aria-invalid={showError}
					autoComplete="off"
				/>
			)}
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			{showError && errors.length > 0 && <FieldError errors={[errors[0]]} />}
		</Field>
	);
}

export function TextArea({
	label,
	rows = 5,
	placeholder,
}: {
	label: string;
	placeholder?: string;
	rows?: number;
}) {
	const field = useFieldContext<string>();
	const { errors, showError, focusProps } = useFieldError<string>();

	return (
		<Field data-invalid={showError}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			<Textarea
				name={field.name}
				id={label}
				value={field.state.value}
				placeholder={placeholder}
				{...focusProps}
				rows={rows}
				onChange={(e) => field.handleChange(e.target.value)}
				aria-invalid={showError}
			/>
			{showError && errors.length > 0 && <FieldError errors={[errors[0]]} />}
		</Field>
	);
}

export function NumberField({
	label,
	placeholder,
}: {
	label: string;
	placeholder?: string;
}) {
	const field = useFieldContext<number>();
	const { errors, showError, focusProps } = useFieldError<number>();

	return (
		<Field data-invalid={showError}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			<Input
				id={field.name}
				type="number"
				value={field.state.value}
				placeholder={placeholder}
				{...focusProps}
				onChange={(e) => field.handleChange(e.target.valueAsNumber)}
				aria-invalid={showError}
				autoComplete="off"
			/>
			{showError && errors.length > 0 && <FieldError errors={[errors[0]]} />}
		</Field>
	);
}

// export function Select({
// 	label,
// 	values,
// 	placeholder,
// }: {
// 	label: string;
// 	values: Array<{ label: string; value: string }>;
// 	placeholder?: string;
// }) {
// 	const field = useFieldContext<string>();
// 	const errors = useStore(field.store, (state) => state.meta.errors);
//
// 	return (
// 		<Field>
// 			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
// 			<Select
// 				name={field.name}
// 				value={field.state.value}
// 				onValueChange={(value) => field.handleChange(value)}
// 			>
// 				<SelectTrigger className="w-full">
// 					<SelectValue placeholder={placeholder} />
// 				</SelectTrigger>
// 				<SelectContent>
// 					<SelectGroup>
// 						<SelectLabel>{label}</SelectLabel>
// 						{values.map((value) => (
// 							<SelectItem key={value.value} value={value.value}>
// 								{value.label}
// 							</SelectItem>
// 						))}
// 					</SelectGroup>
// 				</SelectContent>
// 			</Select>
// 		</Field>
// 	);
// }
//
// export function Slider({ label }: { label: string }) {
// 	const field = useFieldContext<number>();
// 	const errors = useStore(field.store, (state) => state.meta.errors);
//
// 	return (
// 		<div>
// 			<Label htmlFor={label} className="mb-2 text-xl font-bold">
// 				{label}
// 			</Label>
// 			<ShadcnSlider
// 				id={label}
// 				onBlur={field.handleBlur}
// 				value={[field.state.value]}
// 				onValueChange={(value) => field.handleChange(value[0])}
// 			/>
// 		</div>
// 	);
// }
//
// export function Switch({ label }: { label: string }) {
// 	const field = useFieldContext<boolean>();
// 	const errors = useStore(field.store, (state) => state.meta.errors);
//
// 	return (
// 		<div>
// 			<div className="flex items-center gap-2">
// 				<ShadcnSwitch
// 					id={label}
// 					onBlur={field.handleBlur}
// 					checked={field.state.value}
// 					onCheckedChange={(checked) => field.handleChange(checked)}
// 				/>
// 				<Label htmlFor={label}>{label}</Label>
// 			</div>
// 		</div>
// 	);
// }
