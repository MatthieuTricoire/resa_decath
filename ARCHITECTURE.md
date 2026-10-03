# ARCHITECTURE

Document de référence pour un agent de refactorisation. Il décrit l'état actuel du
code, pas ce qu'il devrait être. Les numéros de ligne sont indicatifs et se périment vite :
préfère les chemins de fichiers.

---

## 1. Vue d'ensemble du projet

### Rôle de l'application

Site de **réservation de matériel de sport en magasin**, pour un point de vente
physique. Deux surfaces :

- **Site public** : consultation du catalogue par ville et par activité, fiche
  produit, choix d'une fenêtre de location (date de retrait + durée), panier,
  puis réservation avec identité et coordonnées. Le stock n'est pas décrémenté en
  ligne : la réservation est enregistrée avec le statut `PENDING_VERIFICATION` et
  validée au comptoir.
- **Backoffice admin** (`/admin`) : catalogue (articles, variantes, attributs,
  options de prix), durées de location, reservations, utilisateurs, horaires du
  magasin, réglages saisonniers, facturation, statistiques.

Règle structurante du domaine : **le serveur est seul juge du prix et de la
disponibilité**. Le client ne fait que refléter ce que le serveur a dit, pour
l'ergonomie.

### Arborescence condensée

```
src/
├── routes/                  # routage fichier TanStack Router (voir §2)
│   ├── __root.tsx           # document, QueryClientProvider, 404
│   ├── router.tsx           # (src/router.tsx) création du routeur + routeTree.gen
│   ├── routeTree.gen.ts     # GÉNÉRÉ par le plugin — ne pas éditer
│   ├── index.tsx            # "/" redirige vers storeCanonicalPath
│   ├── _public.tsx          # layout public (en-tête, pied, CartPersistenceProvider)
│   ├── _public/…            # pages publiques
│   ├── admin/               # backoffice, layout pathless admin/_layout.tsx
│   └── api/                 # auth/$ (better-auth catch-all), sitemap.ts
│
├── components/
│   ├── ui/                  # primitives (button, dialog, select, table, sidebar…)
│   ├── public/              # composants du site public
│   │   ├── rental-window-selector.tsx   # date + durée, client
│   │   ├── cart-persistence.tsx         # restauration/reconciliation du panier
│   │   ├── duration-conflict-notice.tsx
│   │   └── public-header.tsx / public-footer.tsx
│   ├── forms/               # wrappers TanStack Form + RentalWindowField (partagé
│   │                        #   public / backoffice)
│   └── dialogs/
│
├── features/                # un dossier par domaine métier
│   ├── reservations/        # CŒUR : availability, pricing, opening-days,
│   │                        #   checkout-window, reserve.server, public-queries
│   ├── equipements/         # articles, variantes, catégories, attributs, prix
│   ├── durees/              # durées de location
│   ├── attributs/           # attributs de variantes
│   ├── store-hours/         # horaires, ouvertures, jours de fermeture
│   ├── settings/            # réglages saisonniers / rentals
│   ├── users/ auth/ billing/ stats/
│   └── <domaine>/queries.ts + public-queries.ts + query-keys.ts + *.server.ts
│
├── stores/                  # TanStack Store : panier public, dialogues
├── lib/                     # dates, seo, slug, codes, cache-control, email
├── db/                      # schema.ts (source de vérité), index.ts (client), seed
├── config/                  # store.ts (magasin), activities.ts (copies éditoriales)
├── hooks/ integrations/     # better-auth, racine TanStack Query
├── env.ts                   # validation zod des variables d'environnement
└── styles.css
```

Convention de nommage par domaine : `queries.ts` (CRUD admin, session requise),
`public-queries.ts` (lecture publique), `*.server.ts` (code serveur pur),
`query-keys.ts` (factory de clés), `public.schema.ts` (schémas zod d'entrée).

---

## 2. Stack technique & routing

### Stack

| Domaine | Choix |
|---|---|
| UI | React 19, TypeScript strict |
| Build | Vite 7 + plugin `tanstackStart()` + `nitro` + Tailwind 4 |
| Framework | TanStack Start (`@tanstack/react-start`) : SSR, server functions |
| Routing | TanStack Router, **généré depuis le système de fichiers** |
| Données serveur | TanStack Query v5 |
| État client | **TanStack Store** (`@tanstack/react-store`) — pas de Zustand |
| Base | Postgres via `postgres` (postgres.js) + Drizzle ORM |
| Auth | better-auth (`/api/auth/$`) |
| Validation | zod, dans `env.ts` et au bord de chaque server function |
| Formulaires | TanStack Form, encapsulé par `components/forms/app-form.tsx` |
| Styles | Tailwind 4 (`styles.css`), tokens CSS `var(--…)`, Biome pour format/lint |
| Tests | Vitest, y compris en jsdom pour les composants |
| Outillage | `db:generate` / `db:migrate` / `db:push` / `db:seed`, `postbuild` = `scripts/check-bundle.ts` |

Alias d'import : `#/*` → `./src/*` (champ `imports` du `package.json`). Les
variables d'environnement sont validées par `src/env.ts` ; **le client ne lit que
des variables préfixées `VITE_`**.

### TanStack Router — conventions

`src/routeTree.gen.ts` est **généré** par le plugin Vite : toute route ajoutée est
un fichier dans `src/routes`, rien d'autre à écrire à la main.

Conventions en usage :

| Convention | Effet | Exemple |
|---|---|---|
| `_public.tsx` | layout **sans segment d'URL** | toutes les pages client |
| `admin/_layout.tsx` | layout **sans segment d'URL**, garde de session dans son `loader` | `/admin/**` |
| `$param` | segment dynamique obligatoire | `activite/$activitySlug/$productSlug` |
| `{$param}` | paramètre **optionnel** | `location-materiel-{$ville}.tsx` → `/location-materiel` et `/location-materiel/…` |
| `index.tsx` | route index du parent | `admin/_layout/index.tsx` = tableau de bord |
| `api/` + `createServerFileRoute` | endpoint HTTP hors page | `api/sitemap.ts`, `api/auth/$.ts` |

Le routeur est construit dans `src/router.tsx` (`getRouter`) avec
`defaultPreload: "intent"`, `defaultPreloadStaleTime: 0` et
`scrollRestoration: true`. L'import `setupRouterSsrQueryIntegration` y est
**présent mais commented out** : le SSR ne pré-remplit donc pas le cache Query,
ce qui explique l'importance du `staleTime` global.

Inventaire des routes :

| URL | Fichier | Rôle |
|---|---|---|
| `/` | `routes/index.tsx` | redirection vers `storeCanonicalPath` |
| `/location-materiel[/:ville]` | `_public/location-materiel-{$ville}.tsx` | accueil public |
| `/activite/$activitySlug` | `_public/activite/$activitySlug.tsx` | liste des matériels |
| `/activite/$activitySlug/$productSlug` | `_public/activite/$activitySlug/$productSlug.tsx` | fiche produit |
| `/panier` | `_public/panier.tsx` | panier + devis |
| `/reservation` | `_public/reservation.tsx` | formulaire d'identité, soumission |
| `/reservation/$reference` | `_public/reservation/$reference.tsx` | confirmation (jeton en `search`) |
| `/connexion`, `/mon-compte` | `_public/…` | auth client |
| `/admin/**` | `admin/_layout.tsx` + enfants | backoffice |
| `/api/auth/$`, `/api/sitemap` | `routes/api/…` | API |

Patterns recurring d'une route :

- `loader` : `queryClient.ensureQueryData` pour les données de page, `prefetchQuery`
  pour celles d'un layout, et `throw notFound()` si l'URL ne correspond pas à la
  donnée (`$activitySlug` vs catégorie réelle du produit).
- `head` : SEO, toujours via `buildPageHead` + JSON-LD (`#/lib/seo`).
- `headers` : `PUBLIC_PAGE_CACHE_CONTROL` sur les pages publiques.
- Accès params : `Route.useParams()` et `Route.useLoaderData()`.

### TanStack Query — clés et invalidation

**Contexte.** `src/integrations/tanstack-query/root-provider.tsx` crée le
`QueryClient` (un par routeur), avec `staleTime: 60_000` par défaut — le
rationale est écrit dans le fichier : sans cela, l'hydratation refait tous les
appels. Il est injecté via `createRootRouteWithContext` et consommé par
`QueryClientProvider` dans `__root.tsx`.

**Site public : clés littérales, préfixées `public`.**

| Clé | Donnée | `staleTime` |
|---|---|---|
| `["public", "activities"]` | activités (préchargé par le layout) | défaut |
| `["public", "store-schedule"]` | jours d'ouverture + heure de coupure (préchargé par le layout) | 5 min |
| `["public", "rental-durations"]` | catalogue des durées | 5 min |
| `["public", "product", slug]` | fiche produit, filtrée par saison | défaut |
| `["public", "activity", slug]` | activité | défaut |
| `["public", "activity", slug, "products"]` | matériels d'une activité | défaut |
| `["public", "window-quotes", { pickupDate, returnDate, variantIds }]` | devis fiche produit | 60 s |
| `["public", "cart-quote", quoteInput]` | devis panier | défaut |
| `["public", "reservation", reference, token]` | réservation + codes barres | défaut |

Deux règles à respecter lors d'un refactor :

1. **La clé doit contenir tous les paramètres qui changent le résultat.** Les
   clés de devis embarquent les dates et les ids de variantes, triés si l'ordre
   n'est pas significatif, sinon deux rendus successifs produisent deux clés
   différentes.
2. **Une clé de devis se disabled hors fenêtre complète** (`enabled: hasWindow && …`),
   sinon elle part avec des dates vides.

**Backoffice : clés centralisées** dans `src/features/<domaine>/query-keys.ts`,
exposées sous forme de factory :

```ts
export const queryKeys = {
  items: { all: ["equipements","items"], detail: (id) => ["equipements","items",id] },
  variants: { byItem: (itemId) => …, reservable: (pickup, ret) => … },
};
```

**Invalidation.** Elle n'est systématique que côté admin : chaque `useMutation`
appelle `queryClient.invalidateQueries({ queryKey: queryKeys.<domaine>.all })`,
avec une invalidation du détail quand la route reste affichée. Côté public,
**aucune invalidation** : les prix et disponibilités sont volontairement
re-fetcher par `staleTime` et par la clé, et la source de vérité reste le serveur
à la soumission.

---

## 3. Gestion d'état global

### TanStack Store, pas Zustand

Le projet n'a **pas** de Zustand. Les deux stores sont créés avec
`createStore` / consommés avec `useStore` de `@tanstack/react-store`.

```ts
export function usePublicCart<T>(selector: (state: PublicCartState) => T): T {
  return useStore(publicCartStore, selector);
}
```

Tout accès se fait par sélecteur : un composant qui ne veut que les dates ne
ré-abonne pas au tableau de lignes.

### `publicCartStore` — `src/stores/public-cart.store.ts`

État :

```ts
type PublicCartState = {
  lines: PublicCartLine[];   // une ligne par variante + option de prix
  pickupDate: string | null; // "YYYY-MM-DD"
  returnDate: string | null; // "YYYY-MM-DD"
};
```

Une `PublicCartLine` contient `key`, `productSlug`, `productName`,
`activitySlug`, `activityName`, `variantId`, `variantLabel`, `priceOptionId`,
`duration`, `unitPrice`, `quantity`, `imageUrl`. Les libellés sont **figés au
moment de l'ajout** : le panier reste lisible même si le catalogue change.

**Invariant central** : le retour est toujours déduit de la durée, jamais posé
indépendamment. `setPublicCartWindow` recalcule `returnDate = pickup + duration − 1`
(bornes incluses), ce qui garantit qu'une commande n'a qu'une seule période. Toute
durée proposée par l'UI passe par cette fonction, jamais par `setPublicCartDates`
directement (qui sert à la restauration et à la correction de dates).

API :

| Fonction | Rôle |
|---|---|
| `usePublicCart(selector)` | lecture |
| `addPublicCartLine(line)` | fusionne si la `key` existe (incrémente `quantity`) |
| `setPublicCartLineQuantity(key, q)` | quantité bornée, ligne retirée à 0 |
| `removePublicCartLine(key)` | retrait d'une ligne |
| `setPublicCartDates({ pickupDate?, returnDate? })` | pose les dates seules (restauration) |
| `setPublicCartWindow({ pickupDate, durationDays })` | **voie normale**, déduit le retour |
| `clearPublicCart()` | vide lignes et dates (soumission réussie) |
| `cartLineKey({ variantId, priceOptionId })` | `${variantId}:${priceOptionId ?? "daily"}` |

Sélecteurs dérivés — fonctions pures sur l'état, à passer directement au hook
(`usePublicCart(cartItemCount)`) :

| Sélecteur | Rôle |
|---|---|
| `cartDurationDays(state)` | durée courante, `0` si fenêtre incomplète |
| `cartItemCount(state)` | somme des quantités |
| `cartVariantQuantity(state, variantId)` | quantité déjà retenue pour une variante |

### `dialogStore` — `src/stores/dialog.store.ts`

Store d'état de dialogue `{ openDialog: DialogId | null, data }`, avec
`openDialog(id, data)` / `closeDialog()`. Les `DialogId` sont typés
(`confirmDelete`, `createUser`, `editCategory`) : ajouter une modale consiste à
étendre `DialogData`, pas à caster des `string`.

### Persistance et hydratation

Le panier est **volontairement non persistant côté store** : la sauvegarde vit
dans `src/stores/public-cart-persistence.ts` (`sessionStorage`), et le
`CartPersistenceProvider` est monté dans le layout `_public.tsx` — donc absent du
SSR, où `sessionStorage` n'existe pas. `useCartHydrated()` permet d'afficher «
panier vide » sans mentir pendant l'hydratation.

À la restauration, le provider appelle `getPublicCartIdentities` pour rafraîchir
les identités des lignes et **retirer les matériels sortis du circuit** (le slug
fait autorité à la réservation). En cas d'échec réseau, il renvoie `null` et
laisse le panier tel quel plutôt que de le vider.

---

## 4. Règles de flux de données

### La chaîne

```
UI (route / composant)
  └─ lecture   usePublicCart(sélecteur)            → état local
  └─ écriture setPublicCartWindow / addPublicCartLine
                    │
                    ▼
        useQuery(server fn)  ── clé = paramètres de la requête
                    │
                    ▼
   createServerFn + zod .inputValidator().parse()    ← frontière de confiance
                    │
                    ▼
   prédicats métier purs (availability / pricing / opening-days)
                    │
                    ▼
              drizzle → Postgres
                    │
                    ▼
   retour JSON → le composant n'affiche que ce que le serveur a dit
```

### Règles à ne pas casser

1. **Une seule source de vérité par prédicat.** Les mêmes questions — « ce matériel
   est-il louable sur ces dates ? », « cette durée est-elle tarifée ? », « ce
   magasin ouvre-t-il ce jour-là ? » — ont une fonction unique, partagée par le
   client, le serveur et le backoffice. Un refactor qui duplique une de ces
   fonctions reintroduit forcément des désaccords d'affichage.

   | Question | Module | Exports clés |
   |---|---|---|
   | Dispo d'un article sur une fenêtre | `features/reservations/availability.ts` | `evaluateItemAvailability`, `cartLineBlocker`, `availableQuantity`, `getActiveSeasonsForRange` |
   | Prix d'une durée | `features/reservations/pricing.ts` | `quoteVariantForDuration`, `productDurationSupport`, `supportsDuration`, `unpricedDurations` |
   | Jours d'ouverture, durée fermée | `features/reservations/opening-days.ts` | `closedReturnDurations`, `isOpenDay`, `resolveDuration`, `returnDateForDuration` |
   | Refus affichés côté sélecteur | `features/reservations/checkout-window.ts` | `resolveCheckoutWindow`, `blockedCheckoutDurations` |
   | Heures, jour, formats | `lib/dates.ts` | `todayInParis`, `earliestPickupDateInParis`, `countRentalDays`, `addDaysToDateKey` |

   `checkout-window.ts` **délègue** à `pricing.ts` : deux modules qui formulent
   différemment le même refus produisent des messages contradictoires à l'écran.

2. **Les dates vivent dans le store, pas dans l'URL.** `pickupDate` / `returnDate`
   sont dans `publicCartStore` et lus via `usePublicCart`. Toute page qui montre un
   sélecteur partage donc la même fenêtre : c'est voulu, la durée s'applique à
   toute la commande. Un composant qui prend les dates en props duplique l'état.

3. **Le grisé est de l'ergonomie, pas une règle.** Les boutons désactivés et les
   encarts d'explication sont dérivés de `blockedDurations`
   (`closedReturnDurations` + `unpricedDurations`). Ils utilisent exactement la
   même liste, donc le message ne peut pas annoncer un refus que l'interface ne
   montre pas. Le refus réel, lui, est toujours rejoué par le serveur.

4. **Le devis est la seule porte de sortie pour le prix.** `getPublicWindowQuotes`
   (fiche produit) et `getPublicCartQuote` (panier) appellent le même
   `quoteOneVariant`, qui évalue la disponibilité puis le prix, et renvoie toujours
   `status` + `reason` + `message`. Le panier n'affiche sesBlocages que si la
   fenêtre est complète ; la fiche produit groupe ses refus en une phrase.

5. **La soumission revalide tout.** Un panier affiché puis laissé en_CACHE n'a
   aucune valeur contractuelle. `reserveEquipment` (`reserve.server.ts`) refait
   `evaluateItemAvailability` puis `quoteVariantForDuration` pour chaque variante,
   et **lève** sur le premier refus. Le schéma zod de l'input public
   (`reserveInputSchema`) ne peut pas lire la base : les règles qui dépendent des
   réglages — dont la coupure du retrait le jour même — sont appliquées côté
   serveur, après coup, par choix.

6. **L'écrire avant de notifier.** `reservePublicReservation` crée la
   réservation, puis envoie l'email. Un échec d'envoi ne doit pas faire perdre la
   réservation : il est journalisé, pas propagé. Même principe côté client :
   `clearPublicCart()` puis navigation, jamais l'inverse.

### Conventions de bord

- Toute server function est `createServerFn(...).inputValidator(schema.parse).handler(...)`.
  Le fichier `*.server.ts` utilise `createServerOnlyFn` : il n'est atteignable que
  depuis un handler.
- Une `loader` ne fait que lire et renvoyer ; elle jette `notFound()` si l'URL ne
  correspond pas à la donnée, pour ne pas exposer un contenu sous une autre URL.
- Les formulaires passent par `useAppForm` (TanStack Form) et `withForm`, jamais
  par un `<form>` local avec état manuel.
- Le refus affiché est toujours rédigé par le code qui refuse
  (`availabilityMessages`, `pricingMessages`, `unpricedDurations`), jamais
  déduit du rendu.
- Un test jsdom de composant doit mocker les server functions (`vi.mock` du module
  `public-queries`), fournir un `QueryClientProvider` avec `retry: false`, et
  amorcer le store : c'est le seul moyen de tester un composant qui lit le panier.