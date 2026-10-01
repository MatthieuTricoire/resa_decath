# AGENT GUIDE - resa_decath

## 🎯 PROJECT OVERVIEW
**Business Domain**: Decathlon equipment rental reservation app  
**Key Features**: 
- Equipment catalog browsing
- Reservation management 
- User authentication (email/password + admin)
- Billing integration

**Tech Stack**:
- Framework: TanStack Start (React + TypeScript)
- Database: Drizzle ORM + PostgreSQL
- State Management: TanStack Query (server) + TanStack Store (client)
- Styling: Tailwind CSS (v4) + shadcn/ui (New York style)

## 💾 DATABASE CRITICAL KNOWLEDGE
- **Schema Location**: `src/db/schema.ts`
- **Gotchas**:
  - ⚠️ Typo in column name: `expirationAtribute` (missing 'b')
  - ⚠️ `reservations.isNoShow` is an `int`, not a boolean
  - ⚠️ `items.slug` has no unique constraint even though public URLs depend on it
- **Opening hours**: `store_hours`, one row per weekday (`day` 0 = Sunday). It is
  the single source for the calendars, the footer, the city page and the JSON-LD.
  Read through `features/store-hours`; `isOpen` decides whether a date can carry
  a pickup or a return. A closed day keeps its slots in base so it can be
  reopened with a single toggle, but they are never published.
- **Seeding**: `npm run db:seed` (uses separate Drizzle client to avoid HMR connection leak)
- ✅ Since migration `0002`, `drizzle/` covers every table: a fresh
  `db:migrate` followed by `db:seed` produces a working base. A local database
  built earlier with `db:push` has these tables *without* migration history, so
  `db:migrate` will fail against it — reset it rather than patching it.

## 🔐 AUTHENTICATION
- **Better Auth Setup**: `src/lib/auth.ts`
- **OTP Handling**: Codes are logged to console (no email transport configured)
- **Admin Guard**: `src/routes/admin/_layout.tsx` (uses `getAdminSession()`)

## 📂 PROJECT STRUCTURE
```
src/
├── routes/        # File-based routing (TanStack Router)
├── db/            # Database schema and connection
├── features/      # Feature modules (reservations, equipements, etc.)
├── lib/           # Shared libraries (auth, email, etc.)
├── stores/        # Client state (TanStack Store)
└── components/    # UI components (shadcn/ui)
```

## 📌 CONVENTIONS
- **Path Aliases**: Use `#/` or `@/` for `src/` (e.g., `#/db/schema`)
- **Type Imports**: Always use `import type` for type-only imports
- **Strings**: Double quotes (enforced by Biome config)
- **Forms**: TanStack Form with Zod validation

## ⚙️ ESSENTIAL COMMANDS
| Command             | Purpose                                  |
|---------------------|------------------------------------------|
| `npm run dev`       | Start dev server (port 3000)             |
| `npm run build`     | Production build                         |
| `npm run db:seed`   | Seed database (bypasses env during ESM)  |
| `npm run check`     | Biome lint + format (add `--write`)     |
| `npm run test`      | Vitest suite                            |
| `npm run lint`      | Run Biome lint (use `--fix` to auto-fix) |
| `npm run format`    | Run Biome format (use `--write` to apply)|

## 🚨 WORKFLOW WARNINGS
1. Never edit `src/routeTree.gen.ts` (auto-generated)
2. `tanstackStartCookies()` must be the last plugin in auth config
3. When seeding DB, `.env.local` must be present for Drizzle
4. Opening days reach the calendars as `{ openDays: number[] }`
   (`features/reservations/opening-days.ts`). `isOpenDay` is the single choke
   point: never re-derive a weekday rule anywhere else.
5. `npm run check` must return 0 errors before committing (it formats too:
   `--write`)