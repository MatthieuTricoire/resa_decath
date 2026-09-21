import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ItemForm } from "#/components/forms/item-form";
import { Button } from "#/components/ui/button";
import { createItem } from "#/features/equipements/queries";

export const Route = createFileRoute("/admin/_layout/equipements/ajouter")({
	component: RouteComponent,
});

function RouteComponent() {
	const router = useRouter();

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" className="size-8" asChild>
					<Link to="/admin/equipements">
						<ArrowLeft className="size-4" />
					</Link>
				</Button>
				<h2 className="text-lg font-semibold">Ajouter un article</h2>
			</div>

			<ItemForm
				submitLabel="Créer l'article"
				onSubmit={async (values) => {
					try {
						await createItem({ data: values });
						toast.success("Article créé avec succès");
						router.navigate({ to: "/admin/equipements" });
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
