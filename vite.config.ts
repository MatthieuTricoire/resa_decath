import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	ssr: {
		noExternal: ["better-auth", "@better-auth", "kysely"],
	},
	optimizeDeps: {
		exclude: ["kysely", "@better-auth/kysely-adapter"],
	},
	build: {
		rolldownOptions: {
			external: [/^@sentry\//],
		},
	},
	plugins: [devtools(), tailwindcss(), tanstackStart(), nitro(), viteReact()],
});
