import { createFileRoute, redirect } from "@tanstack/react-router";
import { storeCanonicalPath } from "#/config/store";

/** `/` n'est pas une page : l'accueil public est canonique ailleurs. */
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: storeCanonicalPath });
	},
});
