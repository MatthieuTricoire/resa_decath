# UI_GUIDELINES

Guide de style condensé, pour un agent qui refactorise l'interface sans la
reconcevoir.
Il décrit **ce qui existe**, pas une intention. Les chiffres viennent d'un
comptage sur `src/**` : ils valent pour l'état actuel, pas pour l'avenir.

---

## 1. Conventions de style et Tailwind

### 1.1 Setup

Tailwind 4 en CSS-first : **il n'y a pas de `tailwind.config.js`**. Tout est
dans `src/styles.css`, avec `@import "tailwindcss"` et un bloc
`@theme inline` qui expose les variables CSS comme couleurs utilitaires
(`bg-primary`, `text-muted-foreground`, `border-border`…). Une classe Tailwind
qui n'est pas dans ce bloc n'existe pas.

| Élément | Valeur |
|---|---|
| Police de corps | `Manrope` (400/500/600/700/800) via `--font-sans` |
| Police de titres | `Fraunces` (500/700) via la classe `.display-title` |
| Rayon de base | `--radius: 0.625rem` → `rounded-lg`, dérivées en `sm/md/xl` |
| Formatage | Biome, tabs, guillemets doubles |

### 1.2 Les variables à utiliser

Deux familles coexistent et **il ne faut pas les confondre** :

**Famille « mer » — les variables maison, à utiliser dans les pages publiques.**
Elles sont écrites en `var(--…)` dans les classes Tailwind. Volumétrie réelle :

| Variable | Usages | Rôle |
|---|---|---|
| `--sea-ink` | 12 | texte principal |
| `--sea-ink-soft` | 72 | texte secondaire, aides, légendes |
| `--line` | 21 | bordure de carte, filet, séparateur |
| `--sand` | 5 | fond d'illustration, d'input en lecture seule |
| `--header-bg` | 1 | fond du header |

**Variables déclarées mais inutilisées** — à ne pas introduire, elles ajoutent de
la confusion sans effet : `--lagoon-deep`, `--palm`, `--foam`, `--chip-bg`,
`--chip-line`, `--link-bg-hover`. Elles n'ont aucun `var()` dans les composants.
`--lagoon`, `--kicker`, `--inset-glint`, `--surface`, `--surface-strong`,
`--bg-base`, `--hero-a/b` ne servent qu'à l'intérieur de `styles.css` lui-même.

**Famille shadcn — les tokens `--background`, `--primary`, `--muted`,
`--destructive`…** Utilisés par `components/ui/*` via les classes
`bg-primary`, `text-muted-foreground`. Ne pas les écrire en `var()` dans une
page : c'est le mélange des deux familles qui rend le code illisible.

Le thème sombre est complet et symétrique (`.dark`, l.67-120). Toute couleur
ajoutée doit l'être dans les deux blocs, sinon la page se casse en sombre.

### 1.3 Les classes maison

Toutes dans `src/styles.css`, à utiliser par leur nom, jamais recopiées en
classes Tailwind équivalentes :

| Classe | Définition | Usages |
|---|---|---|
| `.page-wrap` | `width: min(1080px, calc(100% - 2rem))`, centré | 22 |
| `.display-title` | `font-family: Fraunces` | 27 |
| `.island-kicker` | uppercase, `letter-spacing: .16em`, `0.69rem`, gras, `--kicker` | 27 |
| `.island-shell` | surface verre : bordure `--line`, dégradé `--surface`, ombre portée double, `backdrop-blur` | 18 |
| `.rise-in` | animation d'entrée 700 ms `cubic-bezier(.16,1,.3,1)` | 8 |
| `.feature-card` | variante carte survolée (`translateY(-2px)`) | 2 |
| `.nav-link` | lien de nav avec soulignement animé `scaleX` | 1 |

`.site-footer` (1 usage) est un simple `border-top` + fond — un cas particulier
à ne pas généraliser.

`island-shell` et `island-kicker` sont **le couple de marque du site** : 18 et 27
usages, tous sur les pages publiques. Un nouveau bloc public s'attend aux deux.

### 1.4 Typographie

`text-sm` domine largement (136 usages devant 45 `text-xs`) : c'est le corps de
défaut du site public. Les titres sont en Fraunces via `display-title` :

| Niveau | Classes | Usage |
|---|---|---|
| Titre de page | `display-title text-4xl font-semibold` | nom du produit |
| Titre de section | `display-title text-3xl font-semibold` | blocs de l'accueil |
| Chapeau de bloc | `island-kicker` | marque, catégorie, légende de `fieldset` |
| Montant | `text-2xl font-bold tracking-tight` | prix total, devis |
| Corps | `text-sm` | tout le reste |
| Aide | `text-xs text-[var(--sea-ink-soft)]` | précisions, compteurs |
| Corps.copy | `text-sm leading-relaxed text-[var(--sea-ink-soft)]` | description produit |

`text-lg`, `text-xl`, `text-5xl` (1 usage) sont des exceptions : ne pas en faire
un standard.

### 1.5 Surfaces, arrondis, bordures

Deux façons de faire une carte, et le projet ne tranche pas :

| Manière | Classes | Où |
|---|---|---|
| Classe maison | `island-shell` + `rounded-2xl` | cartes de fond de page (panier, entête de section) |
| Classes inline | `rounded-2xl border border-[var(--line)] bg-white/70 p-4` | blocs à l'intérieur d'une carte (fiche produit) |

`rounded-2xl` (24) pour les conteneurs, `rounded-xl` (12) pour les encarts,
`rounded-lg` (32) et `rounded-md` (51) pour les contrôles. La bordure est
**toujours** `border-[var(--line)]`, ou `border` seul à l'intérieur de
`@layer base` (qui pose `border-border` sur `*`).

Une seule transition globale est déclarée pour `button`, `.island-shell` et `a`
(180 ms sur background, color, border-color, transform). Ne pas ajouter de
`transition-*` sur ces éléments : elle entrerait en conflit.

---

## 2. Composants partagés

### 2.1 Primitives shadcn — `src/components/ui/`

34 fichiers, dont 23 réellement importés et 11 orphelins. Utiliser ceux qui
existent avant d'en écrire un.

| Employés (23) | Orphelins (11) |
|---|---|
| `alert`, `badge`, `button`, `calendar`, `card`, `chart`, `combobox`, `dialog`, `dropdown-menu`, `field`, `input`, `input-group`, `label`, `popover`, `select`, `separator`, `sidebar`, `switch`, `table`, `tabs`, `textarea`, `time-picker`, `tooltip` | `avatar`, `breadcrumb`, `carousel`, `checkbox`, `drawer`, `sheet`, `skeleton`, `slider`, `sonner`, `toggle`, `toggle-group` |

Piège : **`ui/sonner.tsx` est un orphelin**. `__root.tsx` importe `Toaster`
depuis le paquet `sonner` directement (l.11) et non via l'enveloppe du projet,
qui gère le thème. Les deux implémentations coexistent ; ne pas les
confondre en réfléchissant « le toaster est déjà branché ».

Les orphelins ne sont pas inutilisables pour autant : `checkbox` et `slider`
servont quand un formulaire du backoffice en aura besoin. Ils sont simplement
absents du graphe actuel.

`Button` est la seule primitive avec des variantes à connaître :

- `variant` : `default` (`bg-primary` = `#3643ba`), `outline`, `secondary`, `ghost`, `destructive`, `link`
- `size` : `default` `h-9`, `xs` `h-6`, `sm` `h-8`, `lg` `h-10`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`

Toutes les autres primitives sont des enveloppes Radix sans variantes : leur
style vient de `className` ou des classes sémantiques
(`text-muted-foreground`, `border-border`).

`Badge` est la seule autre à variants (`default`, `secondary`, `destructive`,
`outline`), en `rounded-full text-xs`.

Les toasts montés dans `__root.tsx` viennent du paquet `sonner`, pas de
`ui/sonner.tsx` : les messages d'erreur passent par `toast.error` / `toast.info`,
jamais par un état local.

### 2.2 Composants métier

| Composant | Rôle | Connecté ? |
|---|---|---|
| `forms/rental-window-field.tsx` | présentation pure « date + durées + date de retour ». Prend `blockedDurations` (avec le motif), `durationNote`, `onChange({ pickupDate, durationDays })` | **non** |
| `public/rental-window-selector.tsx` | le même champ branché sur le panier + les horaires + les durées du catalogue. Seul porteur de la règle d'affichage des cadenas | **oui** (store + 2 queries) |
| `forms/rental-start-date-picker.tsx` | date de retrait, `minDateKey`, `isUnavailableDate` | non |
| `forms/date-range-picker.tsx` | plage de dates (backoffice) | non |
| `public/duration-conflict-notice.tsx` | « durée non tarifée » + boutons des durées vendues | non |
| `public/cart-persistence.tsx` | restauration et réconciliation du panier (provider) | oui |
| `forms/app-form.tsx` | `useAppForm` / `withForm` TanStack Form, champs `TextField` / `TextArea` / `NumberField` | non |

Le duo `RentalWindowField` / `RentalWindowSelector` est le découpage canonique du
projet : **la présentation ne connaît aucune règle, le composant connecté calcule
et transmet les motifs**. Tout nouveau sélecteur doit suivre ce duo.

### 2.3 Formatage des prix — incohérence à corriger

`formatPrice` existe dans `#/stores/public-cart.store` et est utilisé par le
panier, la confirmation, le compte client et les emails. Mais :

- la **fiche produit formate les prix en ligne**
  (`bookableQuote.unitPrice.toFixed(2).replace(".", ",")`, l.551 et l.570) ;
- `admin/_layout/utilisateurs/$userId/index.tsx:59` **redéfinit** son propre
  `formatPrice`.

Trois implémentations du même formatage. Le premier correctif d'UI à faire.

---

## 3. Opportunités de refactorisation

### 3.1 Ce qu'il faut extraire, par ordre de gain

**`$productSlug.tsx` — 716 lignes, un seul composant `ProductPage`.**

| À extraire | Où | Pourquoi |
|---|---|---|
| `ProductPurchaseBar` | l.619-647 (desktop) **et** l.665-698 (mobile sticky) | le bloc quantité + CTA est **dupliqué à l'identique** dans les deux rendus ; seule la classe d'invocation diffère |
| `QuantityInput` | 3 occurrences : produit desktop, produit mobile, panier l.237-258 | même `<input type="number">` + bornage, avec trois variantes de classes (`w-20 py-1.5`, `w-16 py-2`, `w-16 py-1.5`) |
| `VariantPicker` | l.474-521 | le `fieldset` de variantes, avec sa logique « indisponible sur N jours » / « épuisé pour ces dates » |
| `PriceSummary` | l.540-581 | les deux formes du bloc prix (devis unique ou liste des tarifs) |
| `Callout` | l.452-471 et l.585-604 | deux encarts `rounded-xl border-[var(--line)] bg-white/70 p-4` + `TriangleAlert`, structure identique |
| `availabilityLabel` | l.328 | helper local, testable, sans dépendance JSX |

La logique `isUsable` / `allSoldOut` / `active` (l.180-221) est un **mémo
possiblement extractible en hook** (`useSelectableVariant`) : elle ne dépend que
des devis et des durées, pas du rendu.

**`panier.tsx` — 396 lignes, un seul composant `CartPage`.**

| À extraire | Où | Pourquoi |
|---|---|---|
| `CartLine` | l.189-287 | ~100 lignes de JSX dans un `.map()`, avec 5 vars dérivées (`isPriced`, `priceChanged`, `shownDuration`…) |
| `CartTotals` | l.305-320 et l.370-380 | le récapitulatif total + la barre de validation sont à deux endroits |
| `QuantityInput` | l.237-258 | partagé avec la fiche produit |

**Divergence de classes à corriger en même temps** : `bg-white/70` sur la fiche
produit, `island-shell` sur les cartes du panier. Le même « encart » n'a pas la
même surface selon la page.

### 3.2 Fichiers volumineux du backoffice

| Fichier | Lignes | Remarque |
|---|---|---|
| `admin/_layout/reservations/ajouter.tsx` | 913 | le plus gros du dépôt ; même logique de fenêtre que `checkout-window.ts` |
| `forms/item-form.tsx` | 866 | un formulaire, six sections |
| `data-table.tsx` | 804 | générique, à laisser tel quel |
| `admin/_layout/statistiques.tsx` | 629 | graphiques |
| `admin/_layout/equipements/index.tsx` | 600 | tableau + filtres |

Le découpage du backoffice est **optionnel** pour la livraison : aucune de ces
pages n'est sur le chemin critique du client. À traiter après le public.

### 3.3 Principes de découpage

1. **La séparation suit la dépendance, pas la taille.** Un composant connecté
   (store ou `useQuery`) ne rend jamais un composant qui refait la même requête.
   Le test : si l'extrait pourrait vivre dans `components/ui/`, il ne doit pas
   importer `#/stores` ni `#/features`.

2. **La règle métier ne descend jamais dans un composant présentatif.** C'est le
   contrat de `RentalWindowField` : il reçoit `blockedDurations` *avec le motif
   déjà rédigé*, il ne décide jamais qu'une durée est refusée. Un encart qui
   recalcule un refus.display produit deux messages contradictoires — c'est
   exactement le défaut qu'un découpage introduit.

3. **Extraire par duplication, pas par intuition.** Les deux cibles ci-dessus
   (`ProductPurchaseBar`, `QuantityInput`) sont justifiées par du texte répété,
   pas par un fichier trop long. Un composant de 300 lignes sans duplication n'est
   pas urgent.

4. **La duplication desktop/mobile se résout par props, pas par media query
   interne.** `ProductPurchaseBar` reçoit une variante `compact` ; la barre
   `fixed` reste un conteneur dans la page, pas une responsabilité du composant.

5. **Ne pas créer de couche d'abstraction sur les primitives.** Un
   `QuantityInput` a du sens parce qu'il existe en trois exemplaires avec la
   même borne métier. Un `Card` maison autour de `Card` shadcn n'en a pas.

6. **Extraire sans changer le rendu.** Le test de non-régression, c'est
   `git diff` sur le JSX : un diff de classes est acceptable, un diff de structure
   ne l'est pas. Corrections de classes : `w-20` → `w-16` dans les trois
   variantes de quantité.

### 3.4 Accessibilité à ne pas casser en découpant

Chaque encart du projet suit le même trio, à conserver dans les extraits :

- icône `lucide-react` en `aria-hidden="true"`, `size-4 shrink-0`, `mt-0.5`
- texte du refus dans le flux (`<p>`), jamais dans un `title` ou un `aria-label`
- bouton d'action étiqueté (`aria-label` sur l'icône seule, `sr-only` pour le
  motif d'un cadenas)

`DurationConflictNotice` porte un `aria-live="polite"` et un `aria-label` de
section : c'est le seul endroit où l'encart est annoncé. À ne pas disperser.