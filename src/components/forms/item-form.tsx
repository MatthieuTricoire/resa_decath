import { useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Image, Plus, Trash2, X } from "lucide-react";
import { BarcodeDisplay } from "#/components/barcode";
import { QRCodeDisplay } from "#/components/qr-code";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Field, FieldLabel } from "#/components/ui/field";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { getRentalDurations } from "#/features/durees/queries";
import { queryKeys as dureeQueryKeys } from "#/features/durees/query-keys";
import { getCategories } from "#/features/equipements/queries";
import { queryKeys } from "#/features/equipements/query-keys";
import { useAppForm } from "./app-form";
import { DateRangePicker } from "./date-range-picker";

export type ItemFormImage = {
	id?: string;
	url: string;
	alt: string;
};

export type ItemFormPriceOption = {
	id?: string;
	label: string;
	duration: number;
	price: number;
	barcode: string;
};

export type ItemFormVariant = {
	id?: string;
	sku: string;
	totalStock: number;
	pricingMode: "per_day" | "per_duration";
	dailyPrice: number;
	attributes: Array<{ id?: string; name: string; value: string }>;
	priceOptions: ItemFormPriceOption[];
};

export type ItemFormValues = {
	name: string;
	description: string;
	brand: string;
	categoryId: string;
	season: "winter" | "summer" | "all";
	decathlonUrl: string;
	images: ItemFormImage[];
	availableFrom: string;
	availableTo: string;
	minDuration: number;
	minDurationUnit: "half_day" | "day";
	variants: ItemFormVariant[];
};

type ItemFormProps = {
	initialValues?: ItemFormValues;
	submitLabel: string;
	onSubmit: (values: ItemFormValues) => Promise<void>;
};

function defaultVariant(): ItemFormVariant {
	return {
		id: crypto.randomUUID(),
		sku: "",
		totalStock: 1,
		pricingMode: "per_day",
		dailyPrice: 0,
		attributes: [],
		priceOptions: [],
	};
}

function defaultValues(): ItemFormValues {
	return {
		name: "",
		description: "",
		brand: "Decathlon",
		categoryId: "",
		season: "all",
		decathlonUrl: "",
		images: [],
		availableFrom: "",
		availableTo: "",
		minDuration: 1,
		minDurationUnit: "half_day" as const,
		variants: [defaultVariant()],
	};
}

export function ItemForm({
	initialValues,
	submitLabel,
	onSubmit,
}: ItemFormProps) {
	const { data: categories } = useQuery({
		queryKey: queryKeys.categories.all,
		queryFn: () => getCategories(),
	});

	const { data: durees } = useQuery({
		queryKey: dureeQueryKeys.durees.all,
		queryFn: () => getRentalDurations(),
	});

	const form = useAppForm({
		defaultValues: initialValues ?? defaultValues(),
		onSubmit: async ({ value }) => {
			const enriched = {
				...value,
				variants: value.variants.map((v) => ({
					...v,
					dailyPrice: v.pricingMode === "per_day" ? v.dailyPrice : 0,
					priceOptions: v.pricingMode === "per_day" ? [] : v.priceOptions,
				})),
			};
			await onSubmit(enriched);
		},
	});

	const variants = useStore(form.store, (state) => state.values.variants);
	const images = useStore(form.store, (state) => state.values.images);

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="flex flex-col gap-8"
		>
			<Card>
				<CardHeader>
					<CardTitle>Informations générales</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4">
					<form.AppField name="name">
						{(field) => (
							<field.TextField
								label="Nom"
								placeholder="Sac à dos Simond MH500"
							/>
						)}
					</form.AppField>

					<form.AppField name="brand">
						{(field) => (
							<field.TextField label="Marque" placeholder="Decathlon" />
						)}
					</form.AppField>

					<form.Field name="categoryId">
						{(field) => (
							<Field>
								<FieldLabel>Catégorie</FieldLabel>
								<Select
									value={field.state.value}
									onValueChange={(v) => field.handleChange(v)}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Sélectionner une catégorie" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectLabel>Catégories</SelectLabel>
											{categories?.map((cat) => (
												<SelectItem key={cat.id} value={cat.id}>
													{cat.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
						)}
					</form.Field>

					<form.AppField name="decathlonUrl">
						{(field) => (
							<field.TextField
								label="URL Decathlon"
								placeholder="https://www.decathlon.fr/p/..."
							/>
						)}
					</form.AppField>

					<div className="col-span-2 space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground flex items-center gap-2">
								<Image className="size-4" />
								Images
							</span>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() =>
									form.pushFieldValue("images", {
										id: crypto.randomUUID(),
										url: "",
										alt: "",
									})
								}
							>
								<Plus /> Ajouter
							</Button>
						</div>

						{images.length > 0 && (
							<div className="flex flex-col gap-2">
								{images.map((img, i) => (
									<div key={img.id ?? i} className="flex items-end gap-2">
										<div className="flex-[3]">
											<form.AppField name={`images[${i}].url`}>
												{(field) => (
													<field.TextField
														label="URL de l'image"
														placeholder="https://..."
													/>
												)}
											</form.AppField>
										</div>
										<div className="flex-[2]">
											<form.AppField name={`images[${i}].alt`}>
												{(field) => (
													<field.TextField
														label="Texte alternatif"
														placeholder="Description de l'image"
													/>
												)}
											</form.AppField>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-8 mb-0.5 shrink-0"
											disabled={i === 0}
											onClick={() => {
												const current = form.getFieldValue("images");
												const items = [...current];
												[items[i - 1], items[i]] = [items[i], items[i - 1]];
												form.setFieldValue("images", items);
											}}
										>
											<ArrowUp className="size-4" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-8 mb-0.5 shrink-0"
											disabled={i === images.length - 1}
											onClick={() => {
												const current = form.getFieldValue("images");
												const items = [...current];
												[items[i], items[i + 1]] = [items[i + 1], items[i]];
												form.setFieldValue("images", items);
											}}
										>
											<ArrowDown className="size-4" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-8 mb-0.5 shrink-0"
											onClick={() => form.removeFieldValue("images", i)}
										>
											<X className="size-4" />
										</Button>
									</div>
								))}
							</div>
						)}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Description</CardTitle>
				</CardHeader>
				<CardContent>
					<form.AppField name="description">
						{(field) => (
							<field.TextArea
								label="Description"
								placeholder="Description de l'article..."
							/>
						)}
					</form.AppField>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle>Variantes</CardTitle>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => form.pushFieldValue("variants", defaultVariant())}
					>
						<Plus />
						Ajouter une variante
					</Button>
				</CardHeader>
				<CardContent className="space-y-4">
					{variants.map((v, i) => (
						<Card key={v.id ?? i} className="border-dashed">
							<CardContent className="flex flex-col gap-4 pt-4">
								<div className="flex items-center justify-between">
									<Badge variant="secondary">Variante {i + 1}</Badge>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-8"
										onClick={() => form.removeFieldValue("variants", i)}
										disabled={variants.length <= 1}
									>
										<Trash2 className="size-4" />
									</Button>
								</div>

								<div className="grid grid-cols-2 gap-4">
									<form.AppField name={`variants[${i}].sku`}>
										{(field) => (
											<field.TextField label="SKU" placeholder="8381168" />
										)}
									</form.AppField>
									<form.AppField name={`variants[${i}].totalStock`}>
										{(field) => (
											<field.NumberField label="Stock" placeholder="1" />
										)}
									</form.AppField>
								</div>

								<form.Field name={`variants[${i}].pricingMode`}>
									{(field) => (
										<Field>
											<FieldLabel>Tarification</FieldLabel>
											<div className="flex items-center gap-6">
												<Label className="flex items-center gap-2 cursor-pointer">
													<input
														type="radio"
														name={field.name}
														className="size-4"
														checked={field.state.value === "per_day"}
														onChange={() => field.handleChange("per_day")}
													/>
													Prix à la journée
												</Label>
												<Label className="flex items-center gap-2 cursor-pointer">
													<input
														type="radio"
														name={field.name}
														className="size-4"
														checked={field.state.value === "per_duration"}
														onChange={() => field.handleChange("per_duration")}
													/>
													Tarifs par durée
												</Label>
											</div>
										</Field>
									)}
								</form.Field>

								{variants[i].pricingMode === "per_day" ? (
									<div className="grid grid-cols-2 gap-4">
										<form.AppField name={`variants[${i}].dailyPrice`}>
											{(field) => (
												<field.NumberField
													label="Prix journalier (€) × nombre de jours"
													placeholder="10.00"
												/>
											)}
										</form.AppField>
									</div>
								) : (
									<div className="space-y-3">
										<span className="text-sm font-medium">Options de prix</span>

										{(durees ?? []).length === 0 ? (
											<p className="text-sm text-muted-foreground italic">
												Aucune durée définie. Ajoutez vos durées de location{" "}
												<Link to="/admin/durees" className="underline">
													ici
												</Link>
												.
											</p>
										) : (
											<div className="flex flex-wrap items-center gap-1.5">
												{(durees ?? [])
													.filter(
														(d) =>
															!variants[i].priceOptions.some(
																(o) => o.duration === d.days,
															),
													)
													.map((d) => (
														<Button
															key={d.id}
															type="button"
															variant="outline"
															size="sm"
															onClick={() =>
																form.pushFieldValue(
																	`variants[${i}].priceOptions`,
																	{
																		id: crypto.randomUUID(),
																		label: d.label,
																		duration: d.days,
																		price: 0,
																		barcode: "",
																	},
																)
															}
														>
															<Plus /> {d.label}
														</Button>
													))}
											</div>
										)}

										{variants[i].priceOptions.length > 0 && (
											<div className="flex flex-col gap-3">
												{variants[i].priceOptions.map((opt, j) => {
													const currentDays =
														variants[i].priceOptions[j].duration;
													const availableDurations = (durees ?? []).filter(
														(d) =>
															variants[i].priceOptions.every(
																(o, oi) => oi === j || o.duration !== d.days,
															),
													);
													const currentInList = availableDurations.some(
														(d) => d.days === currentDays,
													);
													return (
														<div
															key={opt.id ?? j}
															className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
														>
															<div className="flex-1 min-w-[120px]">
																<form.AppField
																	name={`variants[${i}].priceOptions[${j}].label`}
																>
																	{(field) => (
																		<field.TextField
																			label="Label"
																			placeholder="1 jour"
																		/>
																	)}
																</form.AppField>
															</div>
															<div className="w-36">
																<form.Field
																	name={`variants[${i}].priceOptions[${j}].duration`}
																>
																	{(field) => (
																		<Field>
																			<FieldLabel>Durée</FieldLabel>
																			<Select
																				value={String(field.state.value)}
																				onValueChange={(v) => {
																					const days = Number(v);
																					field.handleChange(days);
																					const found = (durees ?? []).find(
																						(d) => d.days === days,
																					);
																					if (found) {
																						form.setFieldValue(
																							`variants[${i}].priceOptions[${j}].label`,
																							found.label,
																						);
																					}
																				}}
																			>
																				<SelectTrigger className="w-full">
																					<SelectValue />
																				</SelectTrigger>
																				<SelectContent>
																					<SelectGroup>
																						<SelectLabel>
																							Durées disponibles
																						</SelectLabel>
																						{availableDurations.map((d) => (
																							<SelectItem
																								key={d.id}
																								value={String(d.days)}
																							>
																								{d.label}
																							</SelectItem>
																						))}
																						{!currentInList && (
																							<SelectItem
																								value={String(currentDays)}
																							>
																								{`${currentDays} jour${currentDays > 1 ? "s" : ""} (retirée de la liste)`}
																							</SelectItem>
																						)}
																					</SelectGroup>
																				</SelectContent>
																			</Select>
																		</Field>
																	)}
																</form.Field>
															</div>
															<div className="w-24">
																<form.AppField
																	name={`variants[${i}].priceOptions[${j}].price`}
																>
																	{(field) => (
																		<field.NumberField
																			label="Prix (€)"
																			placeholder="0.00"
																		/>
																	)}
																</form.AppField>
															</div>
															<div className="w-28">
																<form.AppField
																	name={`variants[${i}].priceOptions[${j}].barcode`}
																	validators={{
																		onBlur: ({ value }) =>
																			!value
																				? "Le code-barres est requis"
																				: undefined,
																	}}
																>
																	{(field) => (
																		<field.TextField
																			label="Code-barres"
																			placeholder="..."
																		/>
																	)}
																</form.AppField>
															</div>
															<div className="flex items-end gap-1 pb-1">
																<QRCodeDisplay
																	value={
																		variants[i].priceOptions[j].barcode ||
																		"aucun"
																	}
																	size={56}
																/>
																{variants[i].priceOptions[j].barcode && (
																	<BarcodeDisplay
																		value={variants[i].priceOptions[j].barcode}
																		height={32}
																		barWidth={1}
																	/>
																)}
															</div>
															<Button
																type="button"
																variant="ghost"
																size="icon"
																className="size-8 mb-0.5 shrink-0"
																onClick={() =>
																	form.removeFieldValue(
																		`variants[${i}].priceOptions`,
																		j,
																	)
																}
															>
																<X className="size-4" />
															</Button>
														</div>
													);
												})}
											</div>
										)}
									</div>
								)}

								<div className="space-y-3">
									<div className="flex items-center justify-between">
										<span className="text-sm text-muted-foreground">
											Attributs
										</span>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() =>
												form.pushFieldValue(`variants[${i}].attributes`, {
													id: crypto.randomUUID(),
													name: "",
													value: "",
												})
											}
										>
											<Plus /> Ajouter
										</Button>
									</div>

									{variants[i].attributes.length > 0 && (
										<div className="flex flex-col gap-2">
											{variants[i].attributes.map((attr, j) => (
												<div
													key={attr.id ?? j}
													className="flex items-end gap-2"
												>
													<div className="flex-1">
														<form.AppField
															name={`variants[${i}].attributes[${j}].name`}
														>
															{(field) => (
																<field.TextField
																	label="Nom"
																	placeholder="Taille"
																/>
															)}
														</form.AppField>
													</div>
													<div className="flex-1">
														<form.AppField
															name={`variants[${i}].attributes[${j}].value`}
														>
															{(field) => (
																<field.TextField
																	label="Valeur"
																	placeholder="M"
																/>
															)}
														</form.AppField>
													</div>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="size-8 mb-0.5 shrink-0"
														onClick={() =>
															form.removeFieldValue(
																`variants[${i}].attributes`,
																j,
															)
														}
													>
														<X className="size-4" />
													</Button>
												</div>
											))}
										</div>
									)}
								</div>
							</CardContent>
						</Card>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Disponibilité et durée</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4">
					<div className="col-span-2">
						<DateRangePicker
							valueFrom={useStore(
								form.store,
								(state) => state.values.availableFrom,
							)}
							valueTo={useStore(
								form.store,
								(state) => state.values.availableTo,
							)}
							onChange={(from, to) => {
								form.setFieldValue("availableFrom", from);
								form.setFieldValue("availableTo", to);
							}}
						/>
					</div>

					<form.Field name="season">
						{(field) => (
							<Field>
								<FieldLabel>Saison</FieldLabel>
								<div className="flex items-center gap-6">
									{(["all", "winter", "summer"] as const).map((s) => (
										<Label
											key={s}
											className="flex items-center gap-2 cursor-pointer"
										>
											<input
												type="radio"
												name={field.name}
												className="size-4"
												checked={field.state.value === s}
												onChange={() => field.handleChange(s)}
											/>
											{s === "all"
												? "Toutes saisons"
												: s === "winter"
													? "Hiver"
													: "Été"}
										</Label>
									))}
								</div>
							</Field>
						)}
					</form.Field>

					<div />

					<form.AppField name="minDuration">
						{(field) => (
							<field.NumberField label="Durée minimum" placeholder="1" />
						)}
					</form.AppField>

					<form.Field name="minDurationUnit">
						{(field) => (
							<Field>
								<FieldLabel>Unité durée min.</FieldLabel>
								<Select
									value={field.state.value}
									onValueChange={(v) =>
										field.handleChange(v as "half_day" | "day")
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="half_day">½ journée</SelectItem>
										<SelectItem value="day">Journée</SelectItem>
									</SelectContent>
								</Select>
							</Field>
						)}
					</form.Field>
				</CardContent>
			</Card>

			<form.AppForm>
				<form.SubscribeButton label={submitLabel} />
			</form.AppForm>
		</form>
	);
}
