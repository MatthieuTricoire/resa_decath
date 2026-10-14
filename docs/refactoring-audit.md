# Audit technique et plan de refactorisation

Date : 14 octobre 2026. Périmètre : application, configuration, schéma et migrations, scripts, tests et documentation du dépôt. Audit statique transversal, avec exécution des contrôles disponibles. Aucun fichier applicatif modifié.

## 1. Diagnostic général

L'architecture par fonctionnalités convient à cette application. Il n'y a pas de justification à remplacer TanStack Start, Query, Store, Form ou Drizzle, ni à introduire une architecture en couches systématique. Les principaux risques concernent les frontières d'identité, l'atomicité des écritures et leur concurrence. La longueur de certains fichiers rend ces problèmes plus difficiles à détecter, mais leur découpage seul ne les corrigerait pas.

Trois priorités : protéger les comptes existants face aux entrées publiques ; empêcher la gestion des clients de modifier des comptes privilégiés ; rendre les mutations catalogue et réservations cohérentes en cas d'échec ou de concurrence.

Les recommandations sont classées **critique**, **importante** ou **amélioration facultative**. « Confirmé » signifie observable dans le code ; cela ne signifie pas qu'une exploitation a été réalisée. Les risques dépendant de l'hébergement sont signalés comme tels. Les changements de règles métier proposés nécessitent une validation distincte.

## 2. Méthode et vérifications

- Inventaire des routes, features, composants, stores, bibliothèques, tests, migrations et scripts ; lecture ciblée des points d'entrée et des mutations sensibles.
- Versions relevées dans les packages installés, et non déduites des plages de `package.json`.
- Skills chargés via le CLI Intent installé : `@tanstack/react-start#react-start`, `@tanstack/start-client-core#start-core/server-functions`, `start-core/auth-server-primitives`, `start-core/execution-model`, `@tanstack/router-core#router-core/data-loading` et `router-core/auth-and-guards`.
- CLI utilisé : `node node_modules/@tanstack/intent/dist/cli.mjs`, conformément à `AGENTS.md`. Aucun remplacement téléchargé.

Références locales : [React Start](../node_modules/@tanstack/react-start/skills/react-start/SKILL.md), [server functions](../node_modules/@tanstack/start-client-core/skills/start-core/server-functions/SKILL.md), [authentification serveur](../node_modules/@tanstack/start-client-core/skills/start-core/auth-server-primitives/SKILL.md), [chargement des données](../node_modules/@tanstack/router-core/skills/router-core/data-loading/SKILL.md), [gardes de routes](../node_modules/@tanstack/router-core/skills/router-core/auth-and-guards/SKILL.md). Les métadonnées des skills peuvent porter une version légèrement différente de celle installée : leurs exemples ne doivent pas être copiés sans compilation. Le dépôt utilise actuellement `.validator(...)` ; aucune migration mécanique d'API n'est recommandée.

| Contrôle | Résultat observé |
|---|---|
| `npm run check` | Succès, code 0 : Biome sur 249 fichiers puis TypeScript |
| `npm run test` en sandbox | Échec environnemental : port local interdit (`EPERM`), puis surveillance de fichiers (`EMFILE`) |
| `npm run test` hors sandbox | 29 fichiers, 350 tests réussis, code final 0 ; néanmoins erreur initiale `ReferenceError: module is not defined` dans React et avertissement final de fermeture Vite après timeout |
| Build production / `check:bundle` | Non exécutés dans cet audit ; aucune conclusion sur le bundle actuel |
| Base réelle, concurrence HTTP, navigateur, infrastructure | Non testés ; aucune migration, seed ou écriture de données exécutée |

Les assertions réussissent, mais le lancement des tests n'est pas totalement sain. L'environnement observé est Node 26.11.1. Il faut distinguer ces erreurs d'outillage des défauts applicatifs. Pas de mesure de couverture, de charge, de vulnérabilités publiées des dépendances ni de test d'intrusion : cet audit ne certifie pas l'absence d'autres failles.

## 3. Technologies et conventions réellement utilisées

| Domaine | État observé |
|---|---|
| Interface | React 19.2.6, TypeScript 6.0.3 en mode strict |
| Framework / routes | Start 1.168.60, React Router 1.170.41, routes fichiers et layouts sans segment |
| Données | Query 5.104.1, QueryClient créé par `getRouter()`, hydratation SSR intégrée |
| État client | TanStack Store 0.11.2 ; panier et dialogues globaux ; sélecteurs |
| Formulaires | React Form 1.33.0 avec wrappers maison, mais aussi formulaires manuels en `useState` |
| Validation | Zod 4 ; schémas serveur, validations de champs et validations métier pures |
| Authentification | Better Auth 1.6.13, plugins admin, magic link, email OTP, cookies Start en dernier |
| Persistance | Drizzle 0.45.2, PostgreSQL via `postgres` ; `pg` également présent pour scripts/outillage |
| Styles | Tailwind 4, primitives shadcn et Radix/Base UI, tokens publics et tokens sémantiques dans `styles.css` |
| Build | Vite 8.0.16, Nitro 3 nightly (`3.0.1-20260601-111827-3c588dc4`), plugin React |
| Qualité | Biome 2.4.5, Vitest 4.1.8, Testing Library/jsdom, contrôle de bundle après build |

Conventions effectives : `features/<domaine>` ; `queries.ts` mêlant RPC, SQL, types et parfois logique métier ; séparation `.server.ts` plus nette pour les réservations publiques et l'espace client ; clés Query centralisées en admin, souvent littérales côté public ; alias `#/`, `@/` et imports relatifs coexistants. La coexistence des alias n'est pas un problème prioritaire.

### Points solides à préserver

- `reserve.server.ts` est partagé entre web et comptoir, recalcule les prix et contrôle les disponibilités ; les variantes sont verrouillées en ordre stable dans une transaction avant le contrôle final du stock.
- Les gardes sont présentes dans les handlers privés examinés. Le layout admin n'est donc pas l'unique barrière d'accès.
- L'espace client filtre par utilisateur connecté ; son annulation inclut propriétaire et statut dans la condition SQL.
- Les jours d'ouverture passent par `features/store-hours` et `opening-days.ts`. Ne pas recréer une règle de semaine dans les composants.
- Les prix de réservation sont figés dans les lignes. Les options archivées sont distinguées des options actives.
- `src/router.tsx` intègre bien `setupRouterSsrQueryIntegration`, avec un QueryClient par routeur ; pas de cache Query serveur singleton constaté à cet endroit.
- Les tests couvrent notamment dates, prix, disponibilité, panier, fenêtres de location, horaires et propriété des réservations.
- Pas de paiement en ligne constaté dans le parcours de réservation : la facturation observée correspond à des calculs de forfait et commissions. Ne pas inventer un chantier de migration de paiement.

## 4. Recommandations critiques

### C1 — Entrée publique capable de modifier une identité existante — confirmé

**Fichiers :** `src/features/reservations/public-queries.ts` (`reservePublicReservation`), `public-queries.server.ts` (`upsertPublicUser`, `fetchPublicReservation`).

La réservation anonyme recherche un utilisateur par email, puis remplace son nom, téléphone et carte de fidélité sans preuve de possession de cette adresse. Aucun filtre de rôle n'exclut les administrateurs ou gérants. Cette mise à jour intervient avant la transaction de réservation : un refus de stock peut donc laisser les coordonnées altérées. Les confirmations relisent ensuite l'identité actuelle par jointure, ce qui modifie aussi le rendu des anciennes réservations.

**Risque :** corruption de profils, attribution de réservations à autrui, pollution de l'historique et des coordonnées. Ce chemin ne donne pas, à lui seul, accès à la session ni à l'historique complet de la victime.

**Solution recommandée :** conserver l'identité canonique lorsqu'un email existe sans preuve de possession ; figer les coordonnées déclarées sur la réservation, séparément du compte. Protéger explicitement les comptes d'équipe. Une vérification préalable d'email est une alternative qui change le parcours : à arbitrer, pas à imposer dans un refactor. Pour les créations concurrentes, utiliser une opération atomique fondée sur l'unicité de l'email.

**Vérification :** réservation anonyme avec l'email d'un client puis d'un admin ; aucun champ du compte ne change, y compris si la réservation échoue. Deux soumissions concurrentes pour un nouvel email ne provoquent pas d'erreur d'unicité incontrôlée.

**Risque du correctif :** évolution du modèle de coordonnées et de l'historique ; migration additive et reprise prudente nécessaires. Validation métier préalable.

### C2 — Les mutations « clients » peuvent cibler l'équipe — confirmé

**Fichier :** `src/features/users/queries.ts` (`getUsers`, `updateUser`, `deleteUser`).

`getUsers` ne filtre pas le rôle. `updateUser` et `deleteUser` exigent seulement `requireDashboardSession()`, puis ciblent directement un identifiant utilisateur. Un gérant peut donc demander la modification de l'email d'un administrateur. Les fonctions ne garantissent pas que leur cible soit un client ; masquer un bouton ne résout pas cette frontière.

**Risque :** modification d'une identité privilégiée et possible détournement d'un flux de récupération utilisant son nouvel email. La suppression d'un compte sans réservation peut supprimer ses sessions et credentials par cascade ; les références de réservations peuvent bloquer d'autres suppressions.

**Solution recommandée :** limiter les opérations client au rôle `user` dans la condition SQL et vérifier les lignes retournées. Réserver les mutations d'équipe à des opérations explicitement autorisées ; protéger le dernier admin et les changements d'email sensibles. Établir une matrice acteur/action/cible avant d'élargir les restrictions sur les autres domaines.

**Vérification :** appels serveur directs avec un gérant ciblant un admin, lui-même et un autre gérant ; rejet sans écriture. Conserver les opérations client autorisées. Tester la suppression du dernier admin par les API Better Auth également.

**Risque du correctif :** une interface peut aujourd'hui dépendre de cette liste mixte ; séparer ses sources sans retirer la gestion d'équipe légitime.

## 5. Recommandations importantes

### I1 — Écritures catalogue non atomiques et identifiants enfants insuffisamment rattachés

**Fichier :** `src/features/equipements/queries.ts` (`createItem`, `updateItem`).

Création et modification enchaînent les écritures produit, images, variantes, attributs et tarifs sans transaction globale. Une collision de code-barres ou une suppression empêchée par une FK peut laisser un produit partiellement modifié. Dans `updateItem`, `submittedOptIds.has(opt.id)` prouve seulement que l'identifiant figure dans la requête ; l'UPDATE du tarif filtre ensuite seulement par `priceOptions.id`. Un tarif d'une autre variante peut donc être modifié avec un payload construit directement.

**Solution :** transaction par agrégat produit ; refuser les identifiants de variantes/tarifs étrangers ; conditionner les écritures par identifiant ET parent. Différencier l'archivage d'un tarif référencé et sa suppression. La suppression d'attributs précédant celle d'une variante référencée doit être annulée si la seconde échoue.

**Validation :** échec injecté au milieu d'une sauvegarde, collision de code-barres, tarif appartenant à une autre variante, suppression d'une variante déjà réservée ; aucun état partiel. **Risque :** durée des transactions et comportement de suppression à préciser ; pas de suppression automatique de l'historique.

### I2 — Transition admin vulnérable aux écritures concurrentes

**Fichier :** `src/features/reservations/queries.ts` (`updateReservationStatus`).

Le statut est lu, la transition validée en mémoire, puis l'UPDATE filtre uniquement par ID. Un retrait et une annulation simultanés peuvent tous deux être acceptés à partir de `CONFIRMED`, puis s'écraser. L'annulation client possède déjà une condition SQL plus robuste.

**Solution :** UPDATE conditionné par l'ancien statut, avec `returning` et traitement explicite du conflit, ou verrou transactionnel. Conserver la table des transitions et la sémantique `isNoShow` entière.

**Validation :** concurrence retrait/annulation, double retrait, retour/rejeu ; une seule transition admissible gagne. **Risque :** faire remonter un conflit fonctionnel et rafraîchir l'écran plutôt qu'afficher un succès fictif.

### I3 — Unicité des slugs et contraintes de données

**Fichiers :** `src/db/schema.ts`, `drizzle/`, `src/features/equipements/queries.ts` (`resolveItemSlug`), `public-queries.ts` (`getPublicProduct`).

Le contrôle applicatif du slug est un check puis une écriture, sans contrainte unique. Deux créations concurrentes peuvent produire le même slug ; la lecture publique prend le premier produit trouvé. Elle recherche globalement par slug : une unicité seulement par catégorie ne suffirait pas sans changer cette lecture.

**Solution :** diagnostiquer les doublons puis ajouter une unicité globale, avec gestion de collision. Ajouter progressivement les CHECK utiles absents du schéma : quantités positives, stocks/prix non négatifs, dates ordonnées, `isNoShow` dans 0/1, jour 0–6. Confirmer les contraintes déjà présentes dans la base avant migration.

**Validation :** créations concurrentes et migration sur copie représentative. **Risque :** données historiques incompatibles et changement d'URL si un doublon est renommé ; préparer les redirections utiles. Ne pas renommer `expirationAtribute` ni convertir `isNoShow` pour une seule raison esthétique.

### I4 — Réservation publique sans garde-fou applicatif ni idempotence

**Fichiers :** `src/features/reservations/public-queries.ts`, `reserve.server.ts`, `src/lib/email/transport.ts`.

Les tailles de panier sont bornées et le stock verrouillé, mais la création anonyme n'a pas de limitation explicite ni de clé de requête idempotente dans le code examiné. Deux appels peuvent créer deux réservations si le stock le permet. L'idempotence de l'email n'est pas celle de la réservation.

**Solution :** clé d'idempotence persistée, résultat rejouable et limitation proportionnée du point d'entrée public. Vérifier d'abord les protections de l'hébergeur. Les quotas email existants limitent l'envoi de liens, pas l'immobilisation de stock par réservation.

**Validation :** rejeu et requêtes parallèles avec même clé → une seule réservation ; clés distinctes → comportement actuel. **Risque :** faux positifs derrière une IP partagée ; politique d'expiration et seuils à valider.

### I5 — Secrets dans les logs et politique de confidentialité HTTP à expliciter

**Fichiers :** `src/lib/auth.ts`, `src/features/reservations/public-queries.server.ts`, `src/features/reservations/my-queries.ts`, `src/routes/_public/reservation/$reference.tsx`, `src/lib/cache-control.ts`, configuration d'hébergement.

Les OTP de connexion et vérification sont journalisés sans condition d'environnement. Les confirmations utilisent un jeton en URL, conservé en clair en base, sans expiration vérifiée dans leur lecture. Les routes privées/RPC examinés ne déclarent pas explicitement `Cache-Control: no-store`. L'absence de cache public volontaire n'équivaut pas à une politique privée explicite ; une fuite CDN n'est toutefois pas démontrée.

**Solution :** limiter les logs de codes au développement ; contrôler les réponses effectives SSR et RPC, ajouter `private, no-store` aux données sensibles et une politique Referrer adaptée aux pages à jeton. Masquer les jetons dans les journaux d'accès. Étudier empreinte, révocation et durée de validité des jetons de réservation selon les besoins de consultation.

**Validation :** réponses HTTP anonymes/authentifiées et CDN, absence de codes en logs de production, jetons révoqués refusés. **Risque :** casser les anciens liens ou l'accès durable au récapitulatif ; durée et rotation constituent des décisions produit.

Ne pas déclarer une faille CSRF ou des cookies non sécurisés sur la seule absence de configuration locale : Start et Better Auth fournissent des mécanismes. Vérifier sur la version installée les POST interorigines, les origines approuvées, les attributs cookies et les limites des endpoints auth en déploiement réel.

### I6 — Réservation : validation sensible effectuée avant les verrous

**Fichier :** `src/features/reservations/reserve.server.ts`.

Le stock est relu sous verrou, mais prix, statut opérationnel de la variante et réglages sont lus avant la transaction. Une modification catalogue concurrente peut produire une réservation au tarif précédent ou pour un équipement tout juste retiré. La politique de validité d'un devis n'est pas explicite.

**Solution :** définir ce qui doit être garanti au commit ; relire ou versionner les données concernées dans la transaction, sans verrouiller arbitrairement tout le catalogue. Coordonner ce choix avec I1.

**Validation :** changement de tarif et retrait concurrent à une réservation. **Risque :** contention et évolution involontaire de la garantie de prix ; décision métier préalable.

### I7 — Cache Query : invalidations dispersées et incomplètes entre écrans

**Fichiers :** `src/features/*/query-keys.ts`, `src/routes/admin/_layout/index.tsx`, `reservations/ajouter.tsx`, `reservations/$reservationId/index.tsx`, routes catalogue, hooks publics.

Le dashboard répète plusieurs listes d'invalidations. Le détail réservation invalide un sous-ensemble différent ; la création invalide la liste sans rafraîchir systématiquement tous les indicateurs liés. Les mutations catalogue et réglages ne partagent pas de contrat explicite avec les clés publiques. Avec un `staleTime` global de 60 secondes, une navigation peut afficher des données périmées après une mutation réussie.

**Solution :** quelques helpers ciblés par événement métier (`réservation modifiée`, `catalogue modifié`) et des options Query partagées pour les lectures répétées. Définir les délais acceptables du catalogue public. Éviter un gestionnaire de cache universel. Conserver le recalcul serveur final.

**Validation :** mutation depuis le détail, retour dashboard, stock et compte client ; vérifier rafraîchissement et absence de requêtes doublées à l'hydratation. **Risque :** invalidation trop large causant une rafale de requêtes. Les déconnexions observées rechargent la page via `window.location.href` : pas de fuite intercompte démontrée du cache en mémoire.

### I8 — Validation et formulaires hétérogènes

**Fichiers :** `src/features/equipements/queries.ts`, `src/components/forms/item-form.tsx`, `src/routes/admin/_layout/reservations/ajouter.tsx`, `src/features/users/queries.ts`.

`deleteCategory` emploie un validateur identité `(id: string) => id` : l'annotation TypeScript ne valide pas le réseau. Plusieurs champs ne reflètent pas les longueurs SQL et les dates saisonnières restent des chaînes libres. L'email est normalisé côté public mais pas uniformément dans le CRUD client. La grande page de création de réservation gère manuellement de nombreux champs malgré la convention TanStack Form. Les types de formulaire produit sont parallèles aux schémas serveur.

**Solution :** vrais schémas de frontière, bornes cohérentes avec le schéma SQL, normalisation commune des emails après diagnostic des collisions de casse ; schémas client compatibles sans import serveur. Réutiliser les helpers métier existants pour les dates. Adopter Form sur le formulaire complexe à l'occasion de son découpage, sans convertir tous les petits formulaires.

**Validation :** payloads HTTP invalides, UUID incorrects, dates impossibles, dépassements de longueur, erreurs visibles par champ et soumission clavier. **Risque :** bloquer des valeurs historiques ; dédoublonner les emails avant toute unicité insensible à la casse.

### I9 — Tests de sécurité surtout structurels et exécution peu isolée

**Fichiers :** `src/features/auth/dashboard-guards.test.ts`, tests `.server.test.ts`, `vite.config.ts`, `package.json`.

Les tests de gardes inspectent notamment le texte source et une liste manuelle de fonctions : utile comme garde-fou, insuffisant pour prouver la permission sur la cible, la réponse HTTP et le rollback SQL. Ils ne couvrent pas tous les nouveaux endpoints automatiquement. Aucun scénario réel de concurrence PostgreSQL ou parcours navigateur complet n'a été exécuté ici. Vitest charge la configuration Vite applicative et laisse un serveur ouvert après les assertions dans cet environnement.

**Solution :** configuration Vitest minimale séparée des plugins Start/Nitro/devtools ; contrats HTTP privés pour anonyme/client/gérant/admin et tests d'intégration sur base dédiée pour C1/C2/I1/I2/I3. Conserver les tests métier purs. Ajouter un contrôle automatisé reproductible check/tests/build dans la CI du dépôt, absente des fichiers inventoriés.

**Validation :** processus de test propre sans erreur initiale ni timeout de fermeture ; tests de sécurité exécutant les vraies frontières ; build et `check:bundle`. **Risque :** isolation excessive par mocks masquant les erreurs de compilation Start ; conserver un test du build réel.

## 6. Maintenabilité, performance et améliorations facultatives

| Réf. | Fichiers / constat | Solution et bénéfice concret | Vérification / risque |
|---|---|---|---|
| F1 | `equipements/public-queries.ts` : 1 178 lignes ; `queries.ts` : 952. SQL, DTO, formatage et RPC mélangés ; `describeVariantAttributes` est importé depuis le module RPC par d'autres domaines | Extraire d'abord les helpers purs puis les lectures SQL en `.server.ts`, garder des façades RPC fines. Clarifier les dépendances sans ajouter de repository générique | Build client sans pilote DB, payloads identiques ; risque de cycle et d'import serveur accidentel |
| F2 | `item-form.tsx` : 891 lignes ; création réservation admin : 967 | Extraire sections variantes/tarifs et sélection client/lignes, avec état détenu par le formulaire parent. Faciliter l'examen des invariants | Parcours ajout/modification, suppression et erreurs identiques ; risque de réinitialiser les champs au remontage |
| F3 | `data-table.tsx` : 804 lignes, composants dashboard/nav et `src/app/dashboard/data.json` sans référence entrante trouvée dans la recherche de sources | Confirmer les usages dynamiques puis retirer les exemples inactifs ; ensuite seulement vérifier les dépendances devenues inutiles (`@dnd-kit`, icônes, etc.) | Build et recherche d'import ; ne pas supprimer une dépendance sur cette seule présomption |
| F4 | `dialog.store.ts` : `openDialog` et `Partial<union>` ne conservent pas leur corrélation ; casts dans les dialogues | Union discriminée complète ; garder les callbacks existants et le store simple | Typecheck et ouverture de chaque dialogue ; risque faible, aucun besoin de bus d'événements |
| F5 | `getUsers`, listes réservations/historique ; absence d'index métier déclarés dans le schéma en dehors des contraintes uniques | Mesurer volumes, plans SQL et temps ; pagination serveur si nécessaire et index sur FK/filtres de réservation selon `EXPLAIN` | Comparer sur jeu représentatif ; pas d'index ou de pagination arbitraires avant mesure |
| F6 | `resolveLines` relit le produit pour chaque ligne ; sitemap parcourt les activités séquentiellement | Regrouper les lectures par produit/variante et limiter les allers-retours ; réutiliser des helpers serveur plutôt qu'appeler les façades RPC en interne | Comparer requêtes et résultats ; risque de diverger des filtres publics |
| F7 | `src/db/index.ts` : URL parsée par regex, détection localhost par sous-chaîne, paramètres d'URL perdus dans la branche décomposée, pool `max: 1` | Parseur URL standard et configuration explicite du pilote/SSL/pool, après tests avec les URLs du déploiement. Ne pas augmenter aveuglément le pool en serverless | URLs encodées, IPv6, options requises ; risque de connexion/SSL en production |
| F8 | `src/lib/email/{magic-link,reset-password,team-invitation}.ts` : quotas et échappement HTML similaires ; lecture des compteurs puis insertion de sentinelle | Extraire un petit utilitaire de quota si les règles restent similaires ; rendre atomique la réservation de quota si limite stricte nécessaire | Requêtes concurrentes et service indisponible ; risque d'unifier à tort des politiques différentes |
| F9 | `email/transport.ts` : `fetch` sans délai explicite ; email attendu après commit, échec seulement journalisé | Timeout borné, statut d'envoi observable et possibilité simple de renvoi. Une file durable seulement si les pertes constatées la justifient | Fournisseur lent, erreur réseau, réservation toujours conservée ; risque de doublons lors des reprises |
| F10 | `styles.css`, `UI_GUIDELINES.md`, primitives UI ; tokens publics et shadcn parallèles, CSS exclu de Biome, exemptions accessibilité sur tout `components/ui` | Harmoniser seulement les tokens réellement divergents et réduire les exemptions au besoin ; vérifier focus, clavier, contrastes et mouvement réduit sur les composants touchés | Contrôle visuel public/admin et clavier ; aucun redesign global ni remplacement des primitives |
| F11 | `package.json` : `latest`, Nitro nightly, ancien `@tanstack/start-plugin`, intégration Netlify alors que Vercel est configuré | Clarifier la cible de déploiement et retirer uniquement les dépendances prouvées inutilisées ; stabiliser les mises à jour avec lockfile et CI | Installation propre et build de la cible ; `latest` n'annule pas le verrouillage de `npm ci` |
| F12 | `ARCHITECTURE.md` mentionne Vite 7, ancien statut `PENDING_VERIFICATION`, intégration SSR commentée ; `AGENTS.md` décrit encore l'OTP sans transport | Mettre à jour les faits essentiels et les liens vers le code. Éviter les longs inventaires dupliqués qui se périment | Concordance code/docs ; empêche des « corrections » basées sur un ancien modèle |

Ces tâches restent facultatives tant qu'elles ne bloquent pas un correctif prioritaire. Le découpage F1/F2 devient utile comme préparation limitée d'I1/I8, sans exiger une réorganisation générale du dépôt.

## 7. Application des bonnes pratiques TanStack

| Sujet | Évaluation et décision |
|---|---|
| RPC privés | Gardes dans les handlers : conserver. Corriger surtout la portée des permissions sur la cible (C2) |
| Route admin | La garde est dans `loader`, alors que les loaders enfants peuvent travailler en parallèle. Déplacer la garde de navigation dans `beforeLoad` pour éviter les appels inutiles ; les gardes RPC restent obligatoires. Tester redirection directe et navigation client |
| Frontières serveur | Les loaders examinés appellent les RPC plutôt que directement PostgreSQL. Les fichiers mêlant exports purs et SQL rendent cette garantie plus fragile : extractions ciblées F1, puis build |
| Query / SSR | QueryClient par routeur et intégration SSR présents ; ne pas les remplacer. Le `defaultPreloadStaleTime: 0` est cohérent avec Query comme cache de données |
| Validation réseau | Les types ne sont pas des validateurs runtime ; corriger les validateurs identité et partager les schémas réellement communs |
| Mutations | Invalider les données persistées concernées ; utiliser `useServerFn` pour les appels de composants ayant besoin des redirections Start. Ne pas entourer tous les appels automatiquement si le contrat est déjà géré par Query |
| Erreurs / 404 | Racine avec erreur et 404, détails d'erreur limités au développement. Ajouter les tests de routes inconnues, produit incompatible avec son activité, erreur de RPC et session expirée |
| Devtools | Plugin Vite placé en premier et avant React pour Start. Vérifier l'exclusion effective des devtools au build ; ne pas conclure à une exposition à partir de leur seul import dans `__root.tsx` |

## 8. Plan progressif : tâches indépendantes et vérifiables

Une tâche correspond à une PR réversible, avec son propre critère de sortie. L'ordre n'impose pas de tout terminer avant de livrer un correctif de sécurité. Chaque tâche doit maintenir `npm run check` et les tests utiles ; les changements de frontières Start exigent aussi build et `check:bundle`.

| Ordre / tâche | Priorité | Livrable précis | Dépendance | Critère de sortie et risque |
|---|---|---|---|---|
| T1 — Protéger les cibles utilisateur | Critique | Filtres rôle/cible pour CRUD client, tests gérant → admin, séparation des listes si nécessaire (C2) | Aucune | Aucune écriture privilégiée depuis CRUD client ; risque limité au branchement UI |
| T2 — Protéger l'identité publique | Critique | Contrat validé de coordonnées réservation/compte, tests avant correctif, migration additive si retenue (C1) | Validation du contrat métier | Compte existant inchangé et récapitulatif correct ; risque de reprise historique |
| T3 — Transitions atomiques | Importante | UPDATE conditionnel et conflit explicite (I2) | Aucune | Test concurrent retrait/annulation sur base dédiée |
| T4 — Sauvegarde catalogue atomique | Importante | Transaction et appartenance des enfants (I1) | Aucune ; extraction locale possible | Rollback complet, tarif étranger refusé, références historiques conservées |
| T5 — Unicité des slugs | Importante | Diagnostic données puis migration unique et gestion collisions (I3) | Aucune | Deux créations simultanées ne partagent pas une URL ; retour arrière préparé |
| T6 — Entrées serveur cohérentes | Importante | UUID, bornes, email, dates et tests de payload (I8) | Aucune ; nettoyage email avant contrainte | Entrées malformées refusées avant SQL, cas valides inchangés |
| T7 — Confidentialité et abus publics | Importante | Logs sans OTP en production, tests headers/CSRF effectifs, idempotence et limite réservation (I4/I5) | Validation seuils/durée des liens | Rejeu sans doublon et données privées non stockables par cache partagé |
| T8 — Contrat de concurrence prix/catalogue | Importante | Politique de validité du devis et revalidation appropriée (I6) | Décision produit, coordination T4 | Prix/retrait concurrent conforme à la politique documentée |
| T9 — Fiabiliser l'exécution de tests | Importante | Config Vitest isolée, tests HTTP et SQL ciblés, CI check/tests/build (I9) | Aucune ; peut accompagner T1 | Aucune erreur de démarrage ni serveur bloquant ; base de test explicitement dédiée |
| T10 — Cohérence du cache et garde de navigation | Importante | Invalidation par événement et `beforeLoad` admin (I7) | Aucune | Scénarios mutation → navigation cohérents, SSR sans requêtes doublées |
| T11 — Découpage limité | Facultative | Helpers purs, façades RPC, sections de formulaires, store dialogue typé (F1/F2/F4) | Après stabilisation des correctifs concernés | Contrats et interactions identiques ; aucune couche générique ajoutée |
| T12 — Réduction de dette mesurée | Facultative | Nettoyage code mort confirmé, docs, requêtes/pool mesurés, email et styles ciblés (F3/F5–F12) | Aucune, sélectionner selon mesures | Bénéfice démontré par moins de code, requêtes ou erreurs ; pas de migration technologique |

### Garde-fous de non-régression

Conserver explicitement : durées et bornes de location actuelles, ouverture des seuls endpoints retrait/retour, coupure du jour même spécifique au web, refus de stock au commit, prix figés, distinction web/comptoir, quatre statuts, annulation client limitée au propriétaire et statut autorisé, accès gérant/admin prévu, codes caisse et options archivées. Tester été/hiver, minuit et changements d'heure de Paris pour toute modification de dates.

Les migrations proposées doivent être préparées et testées sur une copie avant exécution autorisée ; ne pas utiliser `db:push` pour contourner l'historique. La suppression de données, le seed et la rotation de credentials ne font pas partie de ce plan de refactorisation.

**Décision attendue :** validation des priorités et des contrats métier de T2/T7/T8 avant réalisation. Ce document ne déclenche aucune modification de code, de base ou de déploiement.
