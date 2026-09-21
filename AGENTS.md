# resa_decath

Decathlon equipment rental reservation app (TanStack Start / React / TypeScript).

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm run test` | Run Vitest (no tests written yet) |
| `npm run lint` | Biome lint (check only — add `--fix` to auto-fix) |
| `npm run format` | Biome format (check only — add `--write` to apply) |
| `npm run check` | Biome lint + format check |
| `npm run db:push` | Push Drizzle schema to DB directly (no migration files) |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:seed` | Seed DB with admin account + sample catalog |
| `npm run db:studio` | Launch Drizzle Studio |

## Architecture

- **Routing**: File-based via TanStack Router in `src/routes/`. `src/routeTree.gen.ts` is **auto-generated** — do not edit.
- **Auth**: Better Auth with email+password + admin plugin. Server instance at `src/lib/auth.ts`. API handler at `src/routes/api/auth/$.ts`. Admin layout at `src/routes/admin/_layout.tsx` guards with `getAdminSession()`.
- **DB**: Drizzle ORM + PostgreSQL. Schema in `src/db/schema.ts`. Connection in `src/db/index.ts` (uses global singleton to prevent HMR connection leak). `DATABASE_URL` loaded from `.env.local` / `.env`.
- **UI**: shadcn/ui (new-york style) in `src/components/ui/`. Tailwind CSS v4. Icon library: lucide-react.
- **State**: TanStack Query (server data), TanStack Store (client state in `src/stores/`).
- **Forms**: TanStack Form + Zod validation.

## Conventions

- `verbatimModuleSyntax` — use `import type` for type-only imports.
- `noUnusedLocals` / `noUnusedParameters` — clean up unused code.
- Path aliases: `#/` and `@/` both resolve to `src/`.
- Quote style: double quotes (Biome config).

## Gotchas

- Biome scripts run in **check-only** mode by default. Pass `--write` for format fixes and `--fix` for lint auto-fixes.
- `@tanstack/react-start` is the framework (not bare Vite + React Router).
- `vite.config.ts` includes `nitro()` plugin — Sentry externalized.
- `better-auth/tanstack-start` plugin (`tanstackStartCookies()`) **must** be the last plugin in the auth config.
- Better Auth currently logs OTP codes to console only (no email transport wired).
- There is a typo in column name `expirationAtribute` (missing `b`) and in the field name `pazzword` in login schema — preserve these unless explicitly asked to fix.
- `db:seed` uses its own Drizzle client (bypasses `#/env`) because ESM hoisting would trigger `createEnv()` before `dotenv` loads `.env.local`.
