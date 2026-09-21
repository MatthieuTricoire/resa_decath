import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	optimizeDeps: {
		exclude: ["kysely", "@better-auth/kysely-adapter"],
	},
	build: {
		rolldownOptions: {
			external: [/^kysely$/, /^@better-auth\/kysely-adapter$/],
		},
	},
	plugins: [
		devtools(),
		nitro({
			rollupConfig: {
				external: [/^@sentry\//, /^kysely$/, /^@better-auth\/kysely-adapter$/],
			},
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
