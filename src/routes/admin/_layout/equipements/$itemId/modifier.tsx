import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ItemForm, type ItemFormValues } from "#/components/forms/item-form";
import { Button } from "#/components/ui/button";
import {
	getItem,
	getItemVariants,
	updateItem,
} from "#/features/equipements/queries";
import { queryKeys } from "#/features/equipements/query-keys";

export const Route = createFileRoute(
	"/admin/_layout/equipements/$itemId/modifier",
)({
	loader: async ({ context: { queryClient }, params: { itemId } }) => {
		await Promise.all([
			queryClient.prefetchQuery({
				queryKey: queryKeys.items.detail(itemId),
				queryFn: () => getItem({ data: itemId }),
			}),
			queryClient.prefetchQuery({
				queryKey: queryKeys.variants.byItem(itemId),
				queryFn: () => getItemVariants({ data: itemId }),
			}),
		]);
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { itemId } = Route.useParams();
	const router = useRouter();

	const { data: item, isPending: itemPending } = useQuery({
		queryKey: queryKeys.items.detail(itemId),
		queryFn: () => getItem({ data: itemId }),
	});

	const { data: variants, isPending: variantsPending } = useQuery({
		queryKey: queryKeys.variants.byItem(itemId),
		queryFn: () => getItemVariants({ data: itemId }),
	});

	if (itemPending || variantsPending) {
		return (
			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="icon" className="size-8" asChild>
						<Link to="/admin/equipements">
							<ArrowLeft className="size-4" />
						</Link>
					</Button>
					<h2 className="text-lg font-semibold">Modifier l'article</h2>
				</div>
				<p className="text-sm text-muted-foreground">Chargement...</p>
			</div>
		);
	}

	if (!item) {
		return (
			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="icon" className="size-8" asChild>
						<Link to="/admin/equipements">
							<ArrowLeft className="size-4" />
						</Link>
					</Button>
					<h2 className="text-lg font-semibold">Modifier l'article</h2>
				</div>
				<p className="text-sm text-muted-foreground">Article introuvable.</p>
			</div>
		);
	}

	const initialValues: ItemFormValues = {
		name: item.name,
		description: item.description ?? "",
		brand: item.brand,
		categoryId: item.categoryId,
		season: item.season,
		decathlonUrl: item.decathlonUrl ?? "",
		images: (item.images ?? []).map((img) => ({
			id: img.id,
			url: img.url,
			alt: img.alt ?? "",
		})),
		availableFrom: item.availableFrom ?? "",
		availableTo: item.availableTo ?? "",
		minDuration: item.minDuration,
		minDurationUnit: item.minDurationUnit,
		variants: (variants ?? []).map((v) => ({
			id: v.id,
			sku: v.decathlonSku ?? "",
			totalStock: v.totalStock,
			pricingMode: v.pricingMode,
			dailyPrice: parseFloat(v.dailyPrice),
			attributes: v.attributes.map((a) => ({
				name: a.name,
				value: a.value,
			})),
			priceOptions: v.priceOptions.map((o) => ({
				id: o.id,
				label: o.label,
				duration: o.duration,
				price: parseFloat(o.price),
				barcode: o.barcode,
			})),
		})),
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" className="size-8" asChild>
					<Link to="/admin/equipements/$itemId" params={{ itemId }}>
						<ArrowLeft className="size-4" />
					</Link>
				</Button>
				<h2 className="text-lg font-semibold">Modifier : {item.name}</h2>
			</div>

			<ItemForm
				initialValues={initialValues}
				submitLabel="Enregistrer"
				onSubmit={async (values) => {
					try {
						await updateItem({ data: { ...values, id: itemId } });
						toast.success("Article modifié avec succès");
						router.navigate({
							to: "/admin/equipements/$itemId",
							params: { itemId },
						});
					} catch (err) {
						const message =
							err instanceof Error
								? err.message
								: typeof err === "object" && err !== null && "message" in err
									? String(err.message)
									: "Erreur inconnue";
						toast.error(`Erreur : ${message}`);
					}
				}}
			/>
		</div>
	);
}
