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

// evenement.date_debut est un DATETIME précis dans le schéma, alors que le prototype
// raisonne en "jour de semaine récurrent" + heure. En attendant un vrai modèle de
// récurrence, on calcule la prochaine occurrence du jour choisi comme date_debut,
// on réutilise la colonne `type` pour le canal de notification (Notification/Email),
// et `description` pour conserver l'abréviation du jour (Lun, Mar, ...).
function nextDateForWeekday(jourAbrev, heure) {
  const map = { Dim: 0, Lun: 1, Mar: 2, Mer: 3, Jeu: 4, Ven: 5, Sam: 6 };
  const target = map[jourAbrev] ?? 1;
  const now = new Date();
  const result = new Date(now);
  const diff = (target - now.getDay() + 7) % 7;
  result.setDate(now.getDate() + diff);
  if (heure) {
    const [h, m] = heure.split(':').map(Number);
    result.setHours(h || 0, m || 0, 0, 0);
  } else {
    result.setHours(8, 0, 0, 0);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${result.getFullYear()}-${pad(result.getMonth() + 1)}-${pad(result.getDate())} ${pad(
    result.getHours()
  )}:${pad(result.getMinutes())}:00`;
}

const evenementController = crudFactory('evenement', 'id_evenement', {
  fields: ['titre', 'description', 'date_debut', 'date_fin', 'lieu', 'type'],
  scopeField: 'id_utilisateur',
});
router.get('/evenements', asyncHandler(evenementController.getAll));
router.get('/evenements/:id', asyncHandler(evenementController.getOne));
router.post(
  '/evenements',
  asyncHandler(async (req, res, next) => {
    const { jour, heure, canal } = req.body;
    if (jour && !req.body.date_debut) {
      req.body.date_debut = nextDateForWeekday(jour, heure);
      req.body.type = canal || 'Notification';
      req.body.description = jour;
    }
    return evenementController.create(req, res, next);
  })
);
router.put('/evenements/:id', asyncHandler(evenementController.update));
router.delete('/evenements/:id', asyncHandler(evenementController.remove));

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
