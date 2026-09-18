const express = require('express');
const router = express.Router();
const crudFactory = require('../utils/crudFactory');
const asyncHandler = require('../utils/asyncHandler');
const prefController = require('../controllers/preferenceController');

function mount(path, controller) {
  router.get(path, asyncHandler(controller.getAll));
  router.get(`${path}/:id`, asyncHandler(controller.getOne));
  router.post(path, asyncHandler(controller.create));
  router.put(`${path}/:id`, asyncHandler(controller.update));
  router.delete(`${path}/:id`, asyncHandler(controller.remove));
}

mount(
  '/evenements',
  crudFactory('evenement', 'id_evenement', {
    fields: ['titre', 'description', 'date_debut', 'date_fin', 'lieu', 'type'],
    scopeField: 'id_utilisateur',
  })
);

mount(
  '/notifications',
  crudFactory('notification', 'id_notification', {
    fields: ['titre', 'message', 'date_envoi', 'type', 'statut'],
    scopeField: 'id_utilisateur',
  })
);

// Préférences de notification : une seule ligne par utilisateur (upsert), donc pas de crudFactory
router.get('/preferences', asyncHandler(prefController.getMine));
router.put('/preferences', asyncHandler(prefController.upsertMine));

module.exports = router;
