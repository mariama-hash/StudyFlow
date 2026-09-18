# StudyFlow — Backend Express

Backend REST pour StudyFlow, structuré autour de tes trois sections
(pédagogique / personnel / économique), basé sur le schéma `studyflow_schema.sql`
fourni.

## Installation

```bash
npm install
cp .env.example .env   # puis renseigne DB_*, JWT_SECRET et OPENROUTER_API_KEY
mysql -u root -p < studyflow_schema.sql   # crée la base + les tables
npm run dev             # ou npm start
```

## Architecture

```
server.js                        point d'entrée Express
src/
  config/db.js                   pool mysql2 (promises)
  middleware/
    auth.js                      authenticate (JWT) + authorize(roles...)
    errorHandler.js              gestion centralisée des erreurs SQL/HTTP (+ erreurs IA « prévues »)
    aiRateLimit.js               limite les appels à l'assistant IA par utilisateur
  utils/
    asyncHandler.js              wrapper try/catch pour routes async
    ownership.js                 résolution de propriété via chaîne de FK
    crudFactory.js                fabrique de contrôleurs CRUD génériques
    openrouter.js                client OpenRouter (seul point d'accès à l'IA) + parseJson
  controllers/
    authController.js            register / login / me / users
    sessionRevisionController.js cas particulier (FK optionnelles)
    preferenceController.js      upsert (1 ligne / utilisateur)
    aiController.js              assistant IA : programme / quiz / mini-projet
  routes/
    authRoutes.js, pedagogiqueRoutes.js, personnelRoutes.js,
    economiqueRoutes.js, transversalRoutes.js, index.js
```

## Authentification

`POST /api/auth/register` et `POST /api/auth/login` renvoient un JWT
(`{ id_utilisateur, role, email }` signé). Toutes les autres routes
(`/api/pedagogique/*`, `/api/personnel/*`, `/api/economique/*`,
`/api/transversal/*`) exigent l'en-tête :

```
Authorization: Bearer <token>
```

## Modèle de propriété des données

Trois modes gérés par `crudFactory` (voir `src/utils/crudFactory.js`) :

1. **`scopeField: 'id_utilisateur'`** — colonne directe (ex: `objectif`,
   `budget`, `evenement`). L'utilisateur ne voit/modifie que ses lignes ;
   un ADMIN voit tout.
2. **`chainConfig`** — propriété retrouvée en remontant une chaîne de
   clés étrangères (ex: une `ue` appartient à un `semestre`, qui appartient
   à une `inscription`, qui appartient à un `utilisateur`). Le fichier
   `src/utils/ownership.js` construit dynamiquement la sous-requête SQL
   imbriquée et vérifie la propriété avant toute écriture.
3. **`adminOnlyWrite: true`** — catalogues partagés (`etablissement`,
   `formation`, `competence`, `badge`, `projet`, `opportunite`) : lecture
   ouverte à tout utilisateur connecté, écriture réservée à `ADMIN`.

`session_revision` a un contrôleur dédié car elle peut être rattachée à
un `objectif` **ou** à une `ue` (les deux FK sont facultatives dans le
schéma) ; la propriété est vérifiée via l'une ou l'autre voie.

## Endpoints principaux

- **Pédagogique** (`/api/pedagogique`) : `etablissements`, `formations`,
  `inscriptions`, `semestres`, `ues`, `evaluations`, `resultats`,
  `objectifs`, `sessions-revision`, `quiz`, `questions`, `tentatives-quiz`
- **Personnel** (`/api/personnel`) : `evenements`, `notifications`,
  `preferences` (GET/PUT, upsert)
- **Économique** (`/api/economique`) : `budgets`, `categories-depense`,
  `depenses` (accepte `categorie` en texte, la catégorie est créée si besoin),
  `budget-courant` (GET/PUT — vue pratique "budget du mois" + réserve imprévus)
- **Transversal** (`/api/transversal`) : `competences`, `projets`,
  `badges`, `opportunites`, plus les tables de jonction côté utilisateur
  (`mes-competences`, `mes-projets`, `mes-badges`) et catalogue
  (`competences-projet/:id`, `competences-opportunite/:id`)

Chaque ressource CRUD expose `GET /`, `GET /:id`, `POST /`, `PUT /:id`,
`DELETE /:id`.

**Assistant IA** (`/api/pedagogique/ai/*`) — `POST /ai/programme` (body :
`{ echeance }`), `POST /ai/quiz` et `POST /ai/projet` (body optionnel : `{ id_ue }`).
Les réponses gardent la forme du prototype (`{ echeance, plan, conseil }`,
`{ sujet, questions }`, `{ sujet, suggestion, objectif }`) et les badges
correspondants sont attribués après chaque génération réussie.

### Assistant IA (OpenRouter)

Modèle : **Google Gemma 4 26B A4B (gratuit)**, `google/gemma-4-26b-a4b-it:free`,
appelé via l'API OpenRouter. Flux strict : **Utilisateur → Backend → IA**. Le navigateur
ne connaît ni la clé ni l'URL d'OpenRouter ; tout passe par
`src/utils/openrouter.js`.

Variables d'environnement :

| Variable | Rôle | Défaut |
|---|---|---|
| `OPENROUTER_API_KEY` | clé créée sur openrouter.ai/keys (**obligatoire**) | — |
| `OPENROUTER_MODEL` | identifiant du modèle | `google/gemma-4-26b-a4b-it:free` |
| `OPENROUTER_TIMEOUT_MS` | délai max d'une réponse | `45000` |
| `AI_RATE_LIMIT_PER_MIN` | demandes IA max par utilisateur et par minute | `6` |

Comment ça marche :

- Le contrôleur lit les UE de l'étudiant, sa moyenne pondérée par UE (`resultat` ×
  `evaluation.coefficient`) et sa prochaine évaluation sans note, puis demande au modèle
  une réponse **en JSON** (`temperature` adaptée à chaque tâche).
- La réponse du modèle n'est jamais renvoyée telle quelle : elle est parsée et validée
  (jours connus, UE qui existent vraiment, nombre de créneaux borné, textes tronqués).
- Erreurs renvoyées au client en français : `400` (aucune UE), `429` (quota ou trop de
  demandes), `502` (IA indisponible ou réponse inexploitable), `503` (clé absente),
  `504` (délai dépassé). Un `401/402/403` d'OpenRouter est volontairement transformé
  en `502` : le frontend déconnecterait l'étudiant sur un `401`.
- Les modèles gratuits ont un quota partagé et limité : un `429` est normal en cas de
  forte utilisation. Passe à un modèle payant en changeant seulement `OPENROUTER_MODEL`.

## Provisionnement automatique (pour coller au prototype)

Le schéma impose des chaînes de clés étrangères strictes (`ue` → `semestre`
→ `inscription` → `utilisateur`, `depense` → `budget`) que le frontend du
prototype ne gère pas explicitement. Pour éviter de bloquer l'UX :

- `POST /api/pedagogique/ues` sans `id_semestre` : provisionne (une fois)
  un établissement/formation/inscription/semestre par défaut pour
  l'utilisateur (`src/utils/defaultAcademic.js`).
- `POST /api/economique/depenses` sans `id_budget` : utilise le "Budget
  mensuel" par défaut de l'utilisateur ; `categorie` (texte) est résolue
  ou créée automatiquement (`src/utils/defaultEconomic.js`).
- `POST /api/personnel/evenements` avec `jour`/`heure`/`canal` (au lieu
  d'un `date_debut` précis) : calcule la prochaine occurrence du jour
  choisi. **Limite connue** : `evenement.date_debut` est un DATETIME
  ponctuel dans le schéma, pas un modèle de récurrence hebdomadaire — la
  colonne `type` est provisoirement réutilisée pour le canal de
  notification et `description` pour le jour. À revoir si on veut des
  rappels vraiment récurrents.
- La "réserve imprévus" du budget (montant séparé du budget total dans le
  prototype) est modélisée comme une ligne `depense` spéciale
  (`imprevue = TRUE`, `description = 'Réserve imprévus'`) plutôt que comme
  une colonne dédiée sur `budget`.

## Ce qui reste à construire

- **Persistance des générations IA** : l'assistant lit UE, notes et
  évaluations mais n'écrit rien dans `quiz`/`question`/`session_revision` ;
  les quiz et programmes générés ne sont donc pas conservés.
- **Planificateur de notifications** (max 3/jour, respect des créneaux
  `preference_notification.heure_debut/heure_fin`, canal email vs
  application) : un job planifié (cron) séparé du serveur HTTP, qui lit
  `evenement` + `preference_notification` et crée les lignes
  `notification` / envoie les emails.
- **Modèle de récurrence** pour `evenement` si les rappels hebdomadaires
  doivent survivre au-delà d'une semaine (colonne `jour_semaine` +
  `recurrent BOOLEAN`, par exemple).
