import { useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Image, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { BarcodeDisplay } from "#/components/barcode";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Field, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
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
import { getAttributeDefinitions } from "#/features/attributs/queries";
import { queryKeys as attributQueryKeys } from "#/features/attributs/query-keys";
import { getRentalDurations } from "#/features/durees/queries";
import { queryKeys as dureeQueryKeys } from "#/features/durees/query-keys";
import { getCategories } from "#/features/equipements/queries";
import { queryKeys } from "#/features/equipements/query-keys";
import { slugify } from "#/lib/slug";
import { cn } from "#/lib/utils";
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
	attributes: Array<{ id?: string; name: string; value: string }>;
	/**
	 * Chaque durée vendue a son prix et son code-barres : une variante sans
	 * option n'est ni vendable en ligne ni encodable en caisse.
	 */
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
	/** Vide = le slug est dérivé du nom, côté serveur. */
	slug: string;
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
		slug: "",
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

	const { data: attributeDefinitions } = useQuery({
		queryKey: attributQueryKeys.attributs.all,
		queryFn: () => getAttributeDefinitions(),
	});

	/**
	 * Le slug d'URL est celui que voit le client. Tant que l'admin ne le saisit
	 * pas, on affiche ce que le serveur en déduira du nom : l'URL reste donc
	 * lisible sans lui faire saisir un identifiant technique.
	 */
	const [slugIsManual, setSlugIsManual] = useState(false);

	/**
	 * Une variante neuve reçoit un identifiant aléatoire : reconstruire ces
	 * valeurs à chaque rendu rend `defaultValues` différent à chaque fois, et
	 * `FormApi.update()` réécrit alors l'état du formulaire en boucle
	 * (« Maximum update depth exceeded »). On fige donc l'identité de l'objet.
	 */
	const defaultFormValues = useMemo(
		() => initialValues ?? defaultValues(),
		[initialValues],
	);

	const form = useAppForm({
		defaultValues: defaultFormValues,
		onSubmit: async ({ value }) => {
			await onSubmit(value);
		},
	});

	const variants = useStore(form.store, (state) => state.values.variants);
	const images = useStore(form.store, (state) => state.values.images);
	const nameValue = useStore(form.store, (state) => state.values.name);
	const slugValue = useStore(form.store, (state) => state.values.slug);
	// Aperçu de l'URL tant que l'admin ne l'édite pas.
	const slugPreview = slugIsManual ? slugValue : slugify(nameValue);

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

					<div className="space-y-1">
						<form.Field name="slug">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Slug d&rsquo;URL</FieldLabel>
									<Input
										id={field.name}
										// Tant que l'admin ne l'édite pas, on montre ce que le
										// serveur déduira du nom plutôt qu'un champ vide.
										value={slugIsManual ? field.state.value : slugPreview}
										placeholder="genere-depuis-le-nom"
										readOnly={!slugIsManual}
										onBlur={field.handleBlur}
										onChange={(e) => {
											setSlugIsManual(true);
											field.handleChange(e.target.value);
										}}
										autoComplete="off"
										className={cn(
											!slugIsManual && "bg-muted/40 text-muted-foreground",
										)}
									/>
								</Field>
							)}
						</form.Field>
						{!slugIsManual && (
							<Button
								type="button"
								variant="link"
								size="sm"
								className="h-auto px-0 text-xs"
								onClick={() => {
									setSlugIsManual(true);
									form.setFieldValue("slug", slugPreview);
								}}
							>
								Personnaliser l&rsquo;URL
							</Button>
						)}
					</div>

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

								<div className="space-y-3">
									<span className="text-sm font-medium">Options de prix</span>
									<p className="text-xs text-muted-foreground">
										Chaque durée vendue a son prix et son code-barres. Sans
										option, la variante n&rsquo;est ni réservable en ligne ni
										encodable en caisse.
									</p>
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
												const availableDurations = (durees ?? []).filter((d) =>
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
														className="flex items-center gap-2"
													>
														<div className="flex flex-1 flex-wrap items-end gap-2 rounded-lg border p-3">
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
																{variants[i].priceOptions[j].barcode && (
																	<BarcodeDisplay
																		value={variants[i].priceOptions[j].barcode}
																		height={32}
																		barWidth={1}
																	/>
																)}
															</div>
														</div>
														<Button
															type="button"
															variant="ghost"
															size="icon"
															className="size-8 shrink-0"
															onClick={() =>
																form.removeFieldValue(
																	`variants[${i}].priceOptions`,
																	j,
																)
															}
														>
															<Trash2 className="size-4" />
														</Button>
													</div>
												);
											})}
										</div>
									)}
								</div>

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

									{(attributeDefinitions ?? []).length === 0 ? (
										<p className="text-sm text-muted-foreground italic">
											Aucun attribut défini. Ajoutez vos attributs{" "}
											<Link to="/admin/reglages/produits" className="underline">
												ici
											</Link>
											.
										</p>
									) : null}

									{variants[i].attributes.length > 0 && (
										<div className="flex flex-col gap-2">
											{variants[i].attributes.map((attr, j) => {
												const usedNames = new Set(
													variants[i].attributes
														.filter((_, ai) => ai !== j)
														.map((a) => a.name)
														.filter(Boolean),
												);
												const availableDefinitions = (
													attributeDefinitions ?? []
												).filter((d) => !usedNames.has(d.name));
												const nameInList = availableDefinitions.some(
													(d) => d.name === attr.name,
												);
												const selectedDef = (attributeDefinitions ?? []).find(
													(d) => d.name === attr.name,
												);
												const valueInList =
													!!selectedDef &&
													selectedDef.values.some(
														(value) => value.value === attr.value,
													);
												return (
													<div
														key={attr.id ?? j}
														className="flex items-center gap-2"
													>
														<div className="flex flex-1 items-end gap-2 rounded-lg border p-3">
															<div className="flex-1">
																<form.Field
																	name={`variants[${i}].attributes[${j}].name`}
																>
																	{(field) => (
																		<Field>
																			<FieldLabel>Nom</FieldLabel>
																			<Select
																				value={field.state.value}
																				onValueChange={(name) => {
																					field.handleChange(name);
																					form.setFieldValue(
																						`variants[${i}].attributes[${j}].value`,
																						"",
																					);
																				}}
																			>
																				<SelectTrigger className="w-full">
																					<SelectValue placeholder="Sélectionner" />
																				</SelectTrigger>
																				<SelectContent>
																					<SelectGroup>
																						<SelectLabel>
																							Attributs disponibles
																						</SelectLabel>
																						{availableDefinitions.map((d) => (
																							<SelectItem
																								key={d.id}
																								value={d.name}
																							>
																								{d.name}
																							</SelectItem>
																						))}
																						{attr.name && !nameInList && (
																							<SelectItem value={attr.name}>
																								{attr.name} (retirée de la
																								liste)
																							</SelectItem>
																						)}
																					</SelectGroup>
																				</SelectContent>
																			</Select>
																		</Field>
																	)}
																</form.Field>
															</div>
															<div className="flex-1">
																<form.Field
																	name={`variants[${i}].attributes[${j}].value`}
																>
																	{(field) => (
																		<Field>
																			<FieldLabel>Valeur</FieldLabel>
																			<Select
																				value={field.state.value}
																				onValueChange={(value) =>
																					field.handleChange(value)
																				}
																			>
																				<SelectTrigger className="w-full">
																					<SelectValue
																						placeholder={
																							selectedDef
																								? "Sélectionner"
																								: "Choisir un attribut"
																						}
																					/>
																				</SelectTrigger>
																				<SelectContent>
																					<SelectGroup>
																						<SelectLabel>
																							Valeurs de « {attr.name} »
																						</SelectLabel>
																						{(selectedDef?.values ?? []).map(
																							(value) => (
																								<SelectItem
																									key={value.id}
																									value={value.value}
																								>
																									{value.value}
																								</SelectItem>
																							),
																						)}
																						{attr.value &&
																							selectedDef &&
																							!valueInList && (
																								<SelectItem value={attr.value}>
																									{attr.value} (retirée de la
																									liste)
																								</SelectItem>
																							)}
																					</SelectGroup>
																				</SelectContent>
																			</Select>
																		</Field>
																	)}
																</form.Field>
															</div>
														</div>
														<Button
															type="button"
															variant="ghost"
															size="icon"
															className="size-8 shrink-0"
															onClick={() =>
																form.removeFieldValue(
																	`variants[${i}].attributes`,
																	j,
																)
															}
														>
															<Trash2 className="size-4" />
														</Button>
													</div>
												);
											})}
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
				</CardContent>
			</Card>

			<form.AppForm>
				<form.SubscribeButton label={submitLabel} />
			</form.AppForm>
		</form>
	);
}
