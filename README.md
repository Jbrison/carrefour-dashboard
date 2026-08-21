# Optimiseur Coupons Carrefour

Extension Chrome Manifest V3 en TypeScript pour analyser les coupons visibles sur la page :

```text
https://www.carrefour.fr/mon-compte/fidelite/mes-coupons
```

Le MVP lit le DOM de la page, parse les cartes candidates, normalise les libellés, regroupe les offres similaires et affiche une synthèse dans un Side Panel Chrome.

## Sécurité et confidentialité

L’extension ne demande jamais le mot de passe Carrefour et ne stocke aucun mot de passe, cookie, token, header d’authentification ou donnée de session. Elle travaille uniquement avec les textes de coupons visibles par l’utilisateur connecté dans Chrome.

Elle ne contourne pas CAPTCHA, 2FA, mécanisme anti-bot ou protection Carrefour. Aucun backend et aucune API externe ne sont utilisés.

## Installation

```bash
npm install
npm run build
```

Puis dans Chrome :

```text
chrome://extensions

Mode développeur
→ Charger l’extension non empaquetée
→ sélectionner le dossier dist
```

## Développement

```bash
npm run typecheck
npm run test
npm run build
```

Pour rebuild automatiquement pendant le développement, lancer les deux commandes dans deux terminaux :

```bash
npm run dev:sidepanel
npm run dev:content
```

Après un rebuild, recharge l’extension depuis `chrome://extensions`.

## Fonctionnement

1. L’utilisateur se connecte normalement à Carrefour.
2. Il ouvre `https://www.carrefour.fr/mon-compte/fidelite/mes-coupons`.
3. Le content script scanne la page et observe les chargements dynamiques via `MutationObserver`.
4. Les coupons parsés et groupes calculés sont stockés dans `chrome.storage.local`.
5. Le Side Panel affiche les statistiques, groupes multiples, filtres, recherche et tri.
6. Un badge discret est ajouté sur la page Carrefour pour ouvrir le panneau.

## Architecture

```text
src/
  content/
    carrefour-coupons.ts
    coupon-parser.ts
    coupon-observer.ts
    selectors.ts

  lib/
    coupon-types.ts
    coupon-normalizer.ts
    coupon-grouper.ts
    coupon-scoring.ts
    date-parser.ts

  sidepanel/
    App.tsx
    CouponGroup.tsx
    CouponList.tsx
    main.tsx
    styles.css

  background/
    service-worker.ts

  storage/
    coupon-storage.ts
```

## Permissions

Permissions Chrome utilisées :

```json
{
  "permissions": ["storage", "sidePanel"],
  "host_permissions": ["https://www.carrefour.fr/mon-compte/fidelite/mes-coupons*"]
}
```

`storage` sert à conserver les coupons parsés, groupes calculés et préférences UI. `sidePanel` sert à afficher la synthèse. La permission hôte limite le content script à la page coupons Carrefour.

## Limites DOM Carrefour

Aucun snapshot réel du DOM Carrefour n’était présent dans ce projet au moment de l’implémentation. Les sélecteurs exacts ne sont donc pas codés comme une vérité définitive.

La détection utilise une couche maintenable dans `src/content/selectors.ts` :

- attributs `data-*` contenant `coupon` ou `voucher` ;
- classes contenant `coupon`, `voucher`, `fidelity`, `fidelite` ou `loyalty` ;
- structures répétitives `article`, `li`, `role=listitem`, cartes ;
- heuristiques texte avec remise, date d’expiration ou CTA.

Pour finaliser les sélecteurs précisément, il faudra récupérer depuis DevTools un extrait HTML anonymisé de quelques cartes coupons Carrefour réelles, incluant les attributs et classes des conteneurs.

## Diagnostic

Si aucun coupon n’est détecté, le Side Panel affiche :

```text
Aucun coupon détecté.

La structure de la page Carrefour a peut-être changé.
```

En mode développement, une section debug indique l’URL, le nombre de cartes candidates, le nombre de coupons parsés et la stratégie DOM utilisée. Les logs debug du content script se limitent au nombre d’éléments, à la stratégie et à des extraits textuels anonymisés.
