import { createFileRoute } from "@tanstack/react-router";
import { AttributeDefinitionsForm } from "#/features/attributs/attribute-definitions-form";
import { getAttributeDefinitions } from "#/features/attributs/queries";
import { queryKeys as attributsQueryKeys } from "#/features/attributs/query-keys";
import { Route as AdminLayoutRoute } from "../../_layout";

export const Route = createFileRoute("/admin/_layout/reglages/produits")({
	loader: async ({ context: { queryClient } }) => {
		await queryClient.prefetchQuery({
			queryKey: attributsQueryKeys.attributs.all,
			queryFn: () => getAttributeDefinitions(),
		});
		return {};
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { user } = AdminLayoutRoute.useLoaderData();

	return (
		<div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 px-4 py-6 md:gap-10 md:py-8 lg:px-6">
			<div>
				<h2 className="text-lg font-semibold">
					Attributs des produits
				</h2>
				<p className="text-sm text-muted-foreground">
					Gérez les tailles, couleurs et autres caractéristiques des articles.
				</p>
			</div>
			<AttributeDefinitionsForm />
		</div>
	);
}