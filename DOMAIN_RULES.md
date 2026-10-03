# DOMAIN_RULES

Règles de gestion de la location, dans l'ordre où elles s'appliquent. Document de
référence pour un **découpage de composants** : chaque règle est rattachée au
module qui la possède, parce que c'est là qu'elle doit survivre au découpage.

Une règle est fausse dès que deux endroits la formulent différemment. C'est le
premier risque d'un découpage : extraire un composant qui recalcule un refus au
lieu de le lire produit des messages contradictoires à l'écran.

---

## 0. Vue d'ensemble : qui répond à quoi

| Question | Module propriétaire | Exports |
|---|---|---|
| Quelle date est proposable aujourd'hui ? | `lib/dates.ts` | `earliestPickupDateInParis`, `isPastSameDayPickupCutoffInParis` |
| Le magasin ouvre-t-il ce jour-là ? | `reservations/opening-days.ts` | `isOpenDay`, `openDays` (via `store-hours/types.ts`) |
| Cette durée est-elle vendable ici ? | `reservations/opening-days.ts` | `closedReturnDurations`, `resolveDuration` |
| Ce matériel vend-il cette durée ? | `reservations/pricing.ts` | `unpricedDurations`, `supportsDuration`, `productDurationSupport` |
| Combien coûte cette durée ? | `reservations/pricing.ts` | `quoteVariantForDuration` |
| Ce matériel est-il louable sur cette fenêtre ? | `reservations/availability.ts` | `evaluateItemAvailability` |
| Combien d'exemplaires reste-t-il ? | `reservations/availability.ts` | `availableQuantity`, `STOCK_CONSUMING_STATUSES` |
| Que refuse la caisse ? | `reservations/checkout-window.ts` | `resolveCheckoutWindow`, `blockedCheckoutDurations` |

Aucun de ces modules n'accède à la base : ils reçoivent des données et répondent.
C'est ce qui les rend testables et réutilisables par le serveur, le site public et
le backoffice à partir du même code.

---

## 1. Règles de dates et d'ouverture

### 1.1 Tout est en journées entières, en Europe/Paris

Le site ne propose **que des dates**, jamais des heures. Une clé `YYYY-MM-DD` est
convertie en `Date` à **midi UTC** (`dateKeyToUtcNoon`) : Paris étant en UTC+1/+2,
le jour civil ne bouge jamais.

Corollaires à ne pas casser :

- Un retrait et un retour **le même jour** comptent pour **une** journée.
  `countRentalDays` fait `diff + 1`.
- Toutes les comparaisons de jour de semaine passent par
  `dayOfWeekFromDateKey` (`opening-days.ts`), qui utilise `getUTCDay()` sur la date
  à midi UTC : `0 = dimanche`. Utiliser `getDay()` sur une date UTC construite
  autrement décale d'un jour aux environs de minuit.
- L'heure de coupure est lue avec `Intl.DateTimeFormat` en `Europe/Paris`,
  **jamais** avec l'heure de la machine (`isPastSameDayPickupCutoffInParis`).
- `dateKeyToUtcNoon` valide la date en round-trip : `2026-02-30` renvoie `null`,
  pas le 2 mars.

### 1.2 Coupure horaire du retrait le jour même

La valeur fait foi est `rental_settings.last_same_day_pickup_hour`, modifiable
depuis l'admin. `DEFAULT_LAST_SAME_DAY_PICKUP_HOUR = 15` n'est **qu'un repli**
quand la base n'a pas encore répondu — le commentaire du fichier est explicite :
« aucun appelant ne doit s'y fier pour une règle métier ».

`earliestPickupDateInParis(cutoffHour)` est **la** fonction à utiliser partout :

```
avant la coupure  → aujourd'hui (Paris)
après la coupure  → demain
```

Elle sert de borne basse à tout le parcours public : calendrier, sauvegarde du
panier, calcul de la durée. Les trois doivent appeler la même fonction, sinon un
panier restauré propose une date que le serveur refuse.

Trois règles qui se combinent :

1. **La coupure est comparée à la date de retrait du client**, pas à l'heure de la
   requête. Un panier ouvert à 14h et soumis à 16h doit être refusé — d'où le
   contrôle dans `reserveEquipment`.
2. **Ce contrôle n'est applique qu'à la source `WEB`.** La caisse backoffice
   saisit une réservation au comptoir, il n'y a plus de délai de préparation à
   respecter : `input.source === "WEB"` est la condition.
3. **Ce contrôle ne peut pas vivre dans le schéma Zod de l'entrée publique**,
   parce qu'un schéma statique ne lit pas la base et que la valeur est
   modifiable par l'admin. Il est appliqué après coup, dans `reserve.server.ts`,
   et c'est délibéré.

`clampCutoffHour` borne la valeur entre 0 et 23 et retombe sur le défaut si elle
n'est pas finie : une heure hors bornes rendrait la règle illisible.

### 1.3 Jours d'ouverture : seules les deux bornes comptent

`OpeningDaysSettings.openDays` est une liste de `0 = dimanche` … `6 = samedi`.
Le module ne connaît **pas** les horaires : l'application raisonne en journées
entières. Une seule liste, donc elle ne peut pas diverger entre les calendriers et
les messages.

**Règle la plus importante de cette section : seuls le retrait et le retour doivent
tomber un jour ouvert. Les jours intermédiaires sont libres.**

Avec un dimanche fermé, une location du samedi au lundi est parfaitement
possible — c'est le cas d'usage principal du week-end. Le matériel reste chez le
client pendant le dimanche, seul le comptoir est fermé. Une refactorisation qui
« sécurise » le check en vérifiant tous les jours de la fenêtre casserait la
moitié des réservations de week-end.

Trois aspects à préserver :

- **`openDays` vide = magasin fermé toute la semaine.** Ce n'est pas une erreur,
  c'est un état valide : un `rental_settings` vide produit exactement la même
  liste. Le site affiche alors un calendrier sans jour selectable, sans erreur.
  Attention : une base migrée mais non ensemencée produit ce symptôme — le site
  répond 200 et refuse toute location.
- **Une date invalide est traitée comme fermée** (`isOpenDay` renvoie `false` si
  la clé n'est pas une date). Le refus doit rester explicite, pas une exception.
- **`closedEndpoints` ne teste que les deux bornes**, et son message diffère selon
  le rôle : une borne de retrait fermée ne se corrige pas en changeant la durée.

### 1.4 Repli de durée : `resolveDuration`

Changer la date de retrait peut invalider la durée courante — vendredi + 2 jours
finit un dimanche ; depuis le samedi, ce dimanche n'accepte plus de retour.

```
resolveDuration(pickupDate, requestedDuration, durations, settings) → number | null
```

Algorithme, dans cet ordre exact :

1. `candidates = bookableDurations(...)` — les durées dont le **retour** tombe un
   jour ouvert. **Le retrait lui-même doit aussi être ouvert** :
   `durationIsBookable` teste les deux bornes.
2. Si `candidates` est vide → **`null`**. L'appelant doit laisser la fenêtre vide
   plutôt que proposer une durée impossible à rendre.
3. Si la durée demandée est dans `candidates` → elle est conservée telle quelle.
4. Sinon **prolonger plutôt que raccourcir** : on prend la première durée
   candidate *supérieure* à la demande, et à défaut la plus grande candidate.

Le choix « prolonger plutôt que raccourcir » est un choix produit, pas un
détail d'implémentation : le client garde au moins les jours qu'il avait demandés.

`resolveCheckoutWindow` (caisse) enveloppe exactement la même logique et ajoute un
cas : sans `settings` (horaires pas encore chargés), il calcule le retour
mécaniquement au lieu d'appliquer la règle d'ouverture.

---

## 2. Modèle de tarification et variantes

### 2.1 Un seul régime : le prix par durée

Il n'existe pas de prix par jour ni de tarif dégressif. Une **option de prix**
(`price_options`) porte `variantId` + `duration` + `label` + `price` (texte) +
`isActive` + un code-barres. Le code-barres est transmis à la caisse.

Une réservation ayant **une seule fenêtre**, la durée est toujours celle de la
commande entière : **il n'existe pas de durée par ligne**.

### 2.2 `parsePrice` : un prix illisible est un prix absent

```ts
/^\d+(\.\d+)?$/.test(value.trim())  → number | null
```

Le commentaire du code explique pourquoi ce n'est pas un détail :
`Number.parseFloat("12,00")` vaut 12 et `parseFloat("1 234,56")` vaut **1**. Un
prix mal saisi deviendrait un montant faux, silencieusement. Un prix non conforme
au motif est donc traité comme **absent**, jamais interprété — ce qui produit un
refus (`unknown_price_option`) au lieu d'un prix inventé.

### 2.3 `quoteVariantForDuration` : la source de vérité du prix

Appelé **à la fois** par la réservation et par les deux devis publics, pour qu'un
prix affiché et un prix encaissé ne puissent pas diverger.

Deux modes, et le choix est significatif :

| Entrée | Comportement |
|---|---|
| `priceOptionId` fourni (caisse, et panier qui a déjà choisi) | l'option doit exister, être lisible **et coller à la durée** ; sinon refus |
| `priceOptionId` absent (devis) | résolution **par durée** : `find(o => o.duration === durationDays)` |

Motifs de refus, dans l'ordre d'évaluation :

| Motif | Cause |
|---|---|
| `invalid_duration` | durée nulle, négative ou non entière |
| `unknown_price_option` | option inexistante, inactive, ou prix illisible |
| `duration_not_priced` | aucune option active ne correspond à la durée |
| `price_option_required` | pas d'option du tout, et le prix dépend de la durée |

### 2.4 `ProductDurationSupport` : ce qu'un produit vend vraiment

```ts
{ durations: number[]; priceByDuration: Record<number, number> }
```

Calculé par `productDurationSupport({ priceOptions, minDuration })`. C'est le
miroir exact de ce que `reserveEquipment` refusera, donc un refus tarifaire peut être
anticipé à l'écran. Deux filtres, dans cet ordre :

1. une option de prix illisible est **ignorée** ;
2. une durée **antérieure à la durée minimale de l'article** disparaît.

Quand plusieurs variantes couvrent la même durée, `priceByDuration[d]` retient le
**prix le plus bas**. C'est une règle d'affichage, pas de facturation : le prix
ferme vient toujours du devis sur la variante réellement choisie.

`supportsDuration(support, n)` est vrai si et seulement si
`priceByDuration[n] !== undefined`. Les deux champs sont donc redondants
volontairement : `durations` pour lister, `priceByDuration` pour répondre.

### 2.5 La fenêtre est globale : conséquences

La date de retrait et la durée vivent dans `publicCartStore`, **pas dans l'URL**.
Corollaires :

- Changer de durée depuis une fiche produit **recalcule tout le panier**. C'est
  pourquoi `$productSlug.tsx` prévient par un toast quand le panier n'est pas vide,
  et pourquoi le panier ré/value chaque ligne après coup.
- Un refus affiché sur une fiche produit peut donc ne plus être vrai au moment du
  devis du panier : les deux consultations sont indépendantes.
- `durationNotPriced` sur une fiche se détecte avec
  `!product.durations.includes(durationDays)` — le serveur a déjà filtré par
  `minDuration`, donc la liste proposée est toujours vendable.

### 2.6 `DurationConflictNotice` : nommer le problème et donner la sortie

S'affiche quand la durée courante n'est pas tarifée pour ce matériel. Deux
états distincts, à ne pas confondre :

| Cas | Rendu |
|---|---|
| `durations` non vide | titre « Non disponible sur N jours », puis un bouton par durée vendue, le prix n'étant affiché que si `priceByDuration[duration]` existe |
| `durations` **vide** | « Aucune durée n'est encore tarifée pour ce matériel. Passez au comptoir location du magasin. » — aucun bouton |

Le composant ne couvre qu'un seul cas : la durée courante non tarifée. « Matériel
non réservable en ligne » est un encart **distinct de la page produit**, à ne pas
y fusionner.

Le composant **n'invente aucun tarif** : `priceByDuration` vient du serveur. Il ne
fait que proposer le changement via `onPickDuration`, et l'appelant décide de ce
que cela implique pour le reste de la commande.

### 2.7 Devis : `getPublicWindowQuotes` et `getPublicCartQuote`

Tous deux passent par `quoteOneVariant`, qui évalue dans cet ordre :

1. **disponibilité** (`evaluateItemAvailability`) → sinon `status: "unavailable"`
   avec `reason` + `message` ;
2. **prix** (`quoteVariantForDuration`) → sinon `status: "no_price_for_duration"` ;
3. sinon `status: "available"` avec `priceOptionId`, `unitPrice`, `label`,
   `availableQuantity`.

Le devis panier ajoute deux agrégats : `total` (les lignes non tarifées comptent
pour 0) et **`complete`** — vrai seulement si *toutes* les lignes sont disponibles
**et** sans rupture de stock. `complete: false` suffit à désactiver le CTA : le
client ne doit pas pouvoir valider un total périmé.

La fiche produit interroge **toutes** ses variantes dans un seul aller-retour,
exprès : c'est ce qui permet d'afficher « épuisé » sur une variante **avant** que le
client ne la sélectionne.

---

## 3. Cas d'erreurs et états bloqués

### 3.1 Six motifs de refus de disponibilité

`evaluateItemAvailability` est le seul point de décision. L'ordre compte : le
premier motif rencontré gagne, il n'y a pas de cumul.

| Motif | Condition | Message public |
|---|---|---|
| `rentals_closed` | `isRentalOpen = false` | « Les locations sont actuellement fermées. » |
| `variant_unavailable` | `status !== AVAILABLE` | « *X* n'est pas disponible à la location. » |
| `outside_item_period` | la fenêtre sort de `availableFrom`/`availableTo` | « La période de disponibilité de *X* ne couvre pas votre fenêtre. » |
| `below_minimum_duration` | durée < `minDuration` | « La durée de location est trop courte pour *X*. » |
| `season_not_configured` | voir §3.2 | « Le calendrier saisonnier n'est pas configuré. » |
| `outside_active_season` | saison de l'article inactive sur la fenêtre | « *X* n'est pas disponible sur toute votre fenêtre. » |

Le message est **toujours rédigé par le code qui refuse**, jamais déduit du
rendu. `availabilityMessages` (public) et l'objet inline de `reserve.server.ts`
(serveur) portent des formulations légèrement différentes pour le même motif : ne
pas les fusionner sans vérifier le rendu.

### 3.2 `season_not_configured` : quatre conditions cumulatives

Le motif ne se déclenche que si **toutes** sont réunies :

1. `seasonalFilteringEnabled = true` (défaut) ;
2. l'article a `season = "summer"` ou `"winter"` — **pas** `"all"` ;
3. `seasonOverride = "auto"` ;
4. aucune des deux paires (`summerFrom`/`summerTo`, `winterFrom`/`winterTo`) n'est
   valide.

`isValidMonthDay` exige le format `MM-DD` **et** une date qui existe
(`13-01` est refusé). Avec `seasonOverride` forcé sur `summer` ou `winter`,
`getActiveSeasonsForRange` renvoie cette saison avec `wholeRangeAvailable: true` :
le motif ne peut plus arriver.

Conséquence importante pour le **filtrage du catalogue**, qui est une autre
fonction : `isItemOutOfSeason` ne répond « oui » que devant `out_of_season`. Ni
`not_filtered` (filtrage désactivé) ni `not_configured` (dates non saisies) ne
masquent quoi que ce soit. Le commentaire du code le formule : *un catalogue
basculé dans le noir parce que l'admin n'a pas saisi ses dates serait pire qu'un
matériel visible*. Il en découle que `getPublicProduct` (sans saison) sert à la
réservation et à la réconciliation du panier, tandis que
`getPublicProductInSeason` sert à la navigation — sinon un matériel hors saison
renverrait « introuvable » au moment de payer, au lieu d'un refus explicite.

### 3.3 Rupture de stock : deux computations, ne les confondre pas

| Contexte | Calcul | Effet |
|---|---|---|
| devis public (`loadReservedQuantities`, `availableQuantity`) | `totalStock - Σ réservations qui chevauchent` | affiche « épuisé », quantity max |
| réservation (`reserveEquipment`) | idem, **dans une transaction**, lignes verrouillées `FOR UPDATE` | refus réel |

Le prédicat de chevauchement est **strict** et identique aux deux endroits :

```
reservation.pickupDate  <  returnDateDemandée
reservation.returnDate  >  pickupDateDemandée
```

Deux locations qui se touchent sans se recouvrir ne consomment donc pas de stock.
Une durée nulle reste exclus par `<`/`>` strict.

Statuts qui immobilisent du matériel — `STOCK_CONSUMING_STATUSES` :
`PENDING_VERIFICATION`, `CONFIRMED`, `COLLECTED`. **Pas** `RETURNED`, **pas**
`CANCELLED`, **pas** `EXPIRED`. Toute divergence entre la constante et le filtre SQL
de la réservation fait diverger le stock affiché du stock réel.

`availableQuantity` et `stockShortage` bornent par 0 : un stock négatif ne doit
jamais produire un nombre négatif affiché, il doit apparaître comme zéro.

### 3.4 Le refus de quantité, formulé par le code

`cartLineBlocker(line)` couvre **deux causes distinctes** et choisit le message
dans cet ordre :

1. `line.status !== "available"` → le message du serveur, ou un repli générique ;
2. sinon, si la quantité demandée dépasse le reste : « Tous les exemplaires sont
   réservés ou loués pour ces dates. » si `availableQuantity === 0`, sinon
   « Stock insuffisant : N exemplaire(s) disponible(s) pour ces dates. »

« exemplaire » se singularise tout seul, contrairement au nom du matériel :
« 1 casque » demanderait de connaître le pluriel. Un découpage qui reformate ces
chaînes casse cette cohérence.

### 3.5 Un refus, une raison à l'écran

`unpricedDurations` accepte `alreadyBlocked`, et `blockedCheckoutDurations`
l'exploite ainsi : la fermeture passe en premier, le tarifaire complète, et
`alreadyBlocked` garantit qu'une durée déjà refusée **garde sa raison de
fermeture**, plus concrète pour le client que « aucun tarif 3j ».

Sur la fiche produit, `RentalWindowSelector` suit exactement la même hiérarchie
(fermeture d'abord), et l'encart sous les durées se déduit des refus réellement
affichés — il ne peut donc pas annoncer un refus absent de l'écran.

Conséquence à retenir pour le découpage : **le message d'encart et les boutons
grisés sont alimentés par la même liste**. Les séparer, c'est risquer d'en
désynchroniser un.

### 3.6 Séquencement obligatoire à la réservation

`reserveEquipment` (`createServerOnlyFn`) est le seul point d'écriture. L'ordre des
contrôles est significatif :

1. durée de la fenêtre valide ;
2. toutes les variantes demandées existent ;
3. **`closedEndpoints`** — retrait et retour ouverts ;
4. **coupure du jour même**, si `source === "WEB"` ;
5. `evaluateItemAvailability` par variante → **lève sur le premier refus** ;
6. `quoteVariantForDuration` par ligne, `priceOptionId` obligatoire ;
7. boucle de retry sur collision de référence, chaque tentative dans une
   transaction avec `SELECT … FOR UPDATE` sur les variantes **triées par id**
   (l'ordre évite les interblocages entre réservations concurrentes) ;
8. insertion `reservations` (statut `CONFIRMED`, source `WEB` ou `STORE`) puis
   `reservation_items` avec `priceAppliedAtReservation` figé.

`priceAppliedAtReservation` est un instantané : un changement de tarif ultérieur ne
doit pas réécrire l'historique.

### 3.7 Séquencement obligatoire à l'écriture client

Trois règles qui ont déjà été corrigées par le passé, à préserver :

1. **Écrire avant de notifier.** `reservePublicReservation` crée la réservation,
   *puis* envoie l'email. Un échec d'envoi est journalisé, jamais propagé — sinon
   le client perd sa réservation parce que le SMTP est tombé.
2. **Vider le panier après succès seulement**, et avant de naviguer : un panier
   vidé après navigation s'affiche encore vide sur la page de confirmation.
3. **Restaurer n'est pas faire foi.** À la relecture du `sessionStorage`,
   `getPublicCartIdentities` rafraîchit les identités et retire les matériels
   sortis du circuit. En cas d'échec réseau, la réconciliation renvoie `null` et
   le panier est **conservé tel quel** plutôt que vidé : le devis signalera de
   toute façon les lignes en défaut.

---

## 4. Pièges connus, à ne pas « corriger » sans décision

- **`getPublicProduct` vs `getPublicProductInSeason`** : les deux existent, ce n'est
  pas un doublon accidentel. Voir §3.2.
- **`availabilityMessages` vs le message serveur de `reserve.server.ts`** : deux
  formulations du même motif, volontairement distinctes (le client public n'a pas à
  voir un `variantId`).
- **`RentalWindowField` est partagé** entre le sélecteur public et la caisse, avec
  un emplacement `durationNote` : le champ porte la présentation, l'appelant porte
  la règle. Extraire le calcul dans le champ créerait deux implémentations.
- **`DEFAULT_LAST_SAME_DAY_PICKUP_HOUR` n'est pas une règle**, c'est un repli. Voir
  §1.2.
- **La coupure du jour même est absente du schéma Zod public**, volontairement. Voir
  §1.2 règle 3.
- **`setupRouterSsrQueryIntegration` est commenté** dans `src/router.tsx` : le SSR ne
  pré-remplit pas le cache Query. Toute la stratégie de `staleTime` en dépend.