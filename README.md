# Anchorspot
Projet AnchorSpot - démo occupation mouillages

## Détection IA du nombre de bateaux (limite connue)

La fonctionnalité de comptage automatique par photo (`api/photo-report.js`) utilise la vision de Claude (Anthropic API) pour estimer le nombre de bateaux au mouillage sur une photo.

### Précision observée

Sur plusieurs tests avec des photos réelles de mouillages :

| Densité de la scène | Écart observé (comptage manuel vs IA) |
|---|---|
| Peu de bateaux, premier plan net | Fiable (~0% d'écart) |
| Mouillage dense, bateaux à distances variées | 30 à 55% de sous-comptage |

**Cause identifiée** : la détection est fiable sur les bateaux au premier plan, mais **sous-compte systématiquement les bateaux lointains/petits** (quelques pixels dans l'image), même après ajustement du prompt pour demander explicitement un scan de l'arrière-plan. Il s'agit d'une limite de perception visuelle du modèle sur les objets de petite taille, pas d'un problème de formulation des instructions.

### Pourquoi ce n'est pas bloquant

- Le `confidence_score` renvoyé reste un signal honnête : il baisse sur les scènes complexes (0.72–0.85) par rapport aux cas simples (0.95), même si le comptage brut n'est pas toujours exact.
- Le système de **correction crowdsourcée** (`api/photo-correction.js`) est conçu précisément pour ce cas : la détection IA sert de première estimation, la communauté affine avec la médiane des corrections dès que 2 utilisateurs contribuent.

### Pistes explorées mais non retenues (pour l'instant)

- Amélioration du prompt (scan explicite premier plan/arrière-plan) : testé, gain marginal seulement.
- Pistes non testées : découpage de l'image en tuiles avant analyse (zoom sur l'arrière-plan), pour améliorer la résolution effective des bateaux lointains.
