import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { useRouter } from "@tanstack/react-router";

/**
 * Le panneau devtools est rendu dans la coquille (`RootDocument`), hors du
 * `QueryClientProvider` de `RootComponent`. On lui passe donc directement le
 * client du contexte du routeur — la même instance que celle qu'utilisent les
 * loaders et le reste de l'app (bloc dev uniquement, retiré en production).
 */
function QueryDevtoolsPanel() {
	const { queryClient } = useRouter().options.context;
	return <ReactQueryDevtoolsPanel client={queryClient} />;
}

export default {
	name: "Tanstack Query",
	render: <QueryDevtoolsPanel />,
};
