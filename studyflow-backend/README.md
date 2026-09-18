# StudyFlow — Backend Express

Backend REST pour StudyFlow, structuré autour de tes trois sections
(pédagogique / personnel / économique), basé sur le schéma `studyflow_schema.sql`
fourni.

## Installation

```bash
npm install
cp .env.example .env   # puis renseigne DB_*, JWT_SECRET
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
    errorHandler.js              gestion centralisée des erreurs SQL/HTTP
  utils/
    asyncHandler.js              wrapper try/catch pour routes async
    ownership.js                 résolution de propriété via chaîne de FK
    crudFactory.js                fabrique de contrôleurs CRUD génériques
  controllers/
    authController.js            register / login / me / users
    sessionRevisionController.js cas particulier (FK optionnelles)
    preferenceController.js      upsert (1 ligne / utilisateur)
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
  `depenses`
- **Transversal** (`/api/transversal`) : `competences`, `projets`,
  `badges`, `opportunites`, plus les tables de jonction côté utilisateur
  (`mes-competences`, `mes-projets`, `mes-badges`) et catalogue
  (`competences-projet/:id`, `competences-opportunite/:id`)

Chaque ressource CRUD expose `GET /`, `GET /:id`, `POST /`, `PUT /:id`,
`DELETE /:id`.

## Ce qui reste à construire (hors périmètre de ce squelette)

- **Assistant IA** (génération de programme de révision, quiz, évaluation
  de niveau, suggestions de mini-projets) : à brancher comme service
  séparé qui consomme ces routes (lecture des UE/résultats) et écrit dans
  `quiz`/`question`/`session_revision`/`utilisateur_badge`.
- **Planificateur de notifications** (max 3/jour, respect des créneaux
  `preference_notification.heure_debut/heure_fin`, canal email vs
  application) : un job planifié (cron) séparé du serveur HTTP, qui lit
  `evenement` + `preference_notification` et crée les lignes
  `notification` / envoie les emails.
- **Attribution automatique des badges** en fin de parcours pédagogique.
