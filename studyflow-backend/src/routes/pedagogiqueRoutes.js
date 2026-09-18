const express = require('express');
const router = express.Router();
const crudFactory = require('../utils/crudFactory');
const asyncHandler = require('../utils/asyncHandler');
const sessionRevisionController = require('../controllers/sessionRevisionController');
const aiController = require('../controllers/aiController');
const aiRateLimit = require('../middleware/aiRateLimit');
const { ensureDefaultSemestre } = require('../utils/defaultAcademic');

function mount(path, controller) {
  router.get(path, asyncHandler(controller.getAll));
  router.get(`${path}/:id`, asyncHandler(controller.getOne));
  router.post(path, asyncHandler(controller.create));
  router.put(`${path}/:id`, asyncHandler(controller.update));
  router.delete(`${path}/:id`, asyncHandler(controller.remove));
}

// --- Catalogue partagé (écriture réservée à l'ADMIN) ---
mount(
  '/etablissements',
  crudFactory('etablissement', 'id_etablissement', {
    fields: ['nom', 'adresse'],
    adminOnlyWrite: true,
  })
);

mount(
  '/formations',
  crudFactory('formation', 'id_formation', {
    fields: ['nom', 'niveau', 'id_etablissement'],
    adminOnlyWrite: true,
  })
);

// --- Parcours de l'étudiant (propriété directe ou en cascade) ---
mount(
  '/inscriptions',
  crudFactory('inscription', 'id_inscription', {
    fields: ['id_formation', 'date_inscription'],
    scopeField: 'id_utilisateur',
  })
);

mount(
  '/semestres',
  crudFactory('semestre', 'id_semestre', {
    fields: ['numero', 'annee_academique', 'id_inscription'],
    chainConfig: {
      fkColumn: 'id_inscription',
      chain: [{ table: 'inscription', pk: 'id_inscription', fk: 'id_utilisateur' }],
    },
  })
);

// UE : id_semestre est requis par le schéma, mais le frontend n'a pas à gérer tout le
// parcours académique. Si id_semestre n'est pas fourni à la création, on provisionne
// (une seule fois) un établissement/formation/inscription/semestre par défaut pour
// l'utilisateur et on l'utilise automatiquement (voir utils/defaultAcademic.js).
const ueController = crudFactory('ue', 'id_ue', {
  fields: ['code_ue', 'nom', 'description', 'credits', 'volume_horaire', 'id_semestre'],
  chainConfig: {
    fkColumn: 'id_semestre',
    chain: [
      { table: 'semestre', pk: 'id_semestre', fk: 'id_inscription' },
      { table: 'inscription', pk: 'id_inscription', fk: 'id_utilisateur' },
    ],
  },
});
router.get('/ues', asyncHandler(ueController.getAll));
router.get('/ues/:id', asyncHandler(ueController.getOne));
router.post(
  '/ues',
  asyncHandler(async (req, res, next) => {
    if (!req.body.id_semestre) {
      req.body.id_semestre = await ensureDefaultSemestre(req.user.id_utilisateur);
    }
    return ueController.create(req, res, next);
  })
);
router.put('/ues/:id', asyncHandler(ueController.update));
router.delete('/ues/:id', asyncHandler(ueController.remove));

mount(
  '/evaluations',
  crudFactory('evaluation', 'id_evaluation', {
    fields: ['type', 'date_evaluation', 'coefficient', 'id_ue'],
    chainConfig: {
      fkColumn: 'id_ue',
      chain: [
        { table: 'ue', pk: 'id_ue', fk: 'id_semestre' },
        { table: 'semestre', pk: 'id_semestre', fk: 'id_inscription' },
        { table: 'inscription', pk: 'id_inscription', fk: 'id_utilisateur' },
      ],
    },
  })
);

mount(
  '/resultats',
  crudFactory('resultat', 'id_resultat', {
    fields: ['note', 'id_evaluation'],
    chainConfig: {
      fkColumn: 'id_evaluation',
      chain: [
        { table: 'evaluation', pk: 'id_evaluation', fk: 'id_ue' },
        { table: 'ue', pk: 'id_ue', fk: 'id_semestre' },
        { table: 'semestre', pk: 'id_semestre', fk: 'id_inscription' },
        { table: 'inscription', pk: 'id_inscription', fk: 'id_utilisateur' },
      ],
    },
  })
);

// --- Objectifs personnels d'apprentissage ---
mount(
  '/objectifs',
  crudFactory('objectif', 'id_objectif', {
    fields: ['titre', 'description', 'date_debut', 'date_fin', 'statut'],
    scopeField: 'id_utilisateur',
  })
);

// session_revision : contrôleur dédié (rattachée à un objectif et/ou une UE)
router.get('/sessions-revision', asyncHandler(sessionRevisionController.getAll));
router.get('/sessions-revision/:id', asyncHandler(sessionRevisionController.getOne));
router.post('/sessions-revision', asyncHandler(sessionRevisionController.create));
router.put('/sessions-revision/:id', asyncHandler(sessionRevisionController.update));
router.delete('/sessions-revision/:id', asyncHandler(sessionRevisionController.remove));

// --- Quiz & évaluation active du niveau ---
mount(
  '/quiz',
  crudFactory('quiz', 'id_quiz', {
    fields: ['titre', 'description', 'difficulte', 'id_ue'],
    chainConfig: {
      fkColumn: 'id_ue',
      chain: [
        { table: 'ue', pk: 'id_ue', fk: 'id_semestre' },
        { table: 'semestre', pk: 'id_semestre', fk: 'id_inscription' },
        { table: 'inscription', pk: 'id_inscription', fk: 'id_utilisateur' },
      ],
    },
  })
);

mount(
  '/questions',
  crudFactory('question', 'id_question', {
    fields: ['enonce', 'type', 'reponse_correcte', 'id_quiz'],
    chainConfig: {
      fkColumn: 'id_quiz',
      chain: [
        { table: 'quiz', pk: 'id_quiz', fk: 'id_ue' },
        { table: 'ue', pk: 'id_ue', fk: 'id_semestre' },
        { table: 'semestre', pk: 'id_semestre', fk: 'id_inscription' },
        { table: 'inscription', pk: 'id_inscription', fk: 'id_utilisateur' },
      ],
    },
  })
);

mount(
  '/tentatives-quiz',
  crudFactory('tentative_quiz', 'id_tentative', {
    fields: ['score', 'id_quiz'],
    scopeField: 'id_utilisateur',
  })
);

// --- Assistant IA (programme de révision, quiz, mini-projet) ---
// Le modèle (OpenRouter) n'est appelé que d'ici, côté serveur : Utilisateur → Backend → IA.
// Le limiteur protège le quota de la clé partagée.
router.use('/ai', aiRateLimit);
router.post('/ai/programme', asyncHandler(aiController.programme));
router.post('/ai/quiz', asyncHandler(aiController.quiz));
router.post('/ai/projet', asyncHandler(aiController.projet));

module.exports = router;
