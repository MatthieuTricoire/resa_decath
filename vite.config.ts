import netlify from "@netlify/vite-plugin-tanstack-start";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	optimizeDeps: {
		exclude: ["kysely", "@better-auth/kysely-adapter"],
	},
	build: {
		rolldownOptions: {
			external: [/^@sentry\//, /^kysely$/, /^@better-auth\/kysely-adapter$/],
		},
	},
	plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact(), netlify()],
});

export default config;
