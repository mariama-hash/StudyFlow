const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const crudFactory = require('../utils/crudFactory');
const asyncHandler = require('../utils/asyncHandler');

function mount(path, controller) {
  router.get(path, asyncHandler(controller.getAll));
  router.get(`${path}/:id`, asyncHandler(controller.getOne));
  router.post(path, asyncHandler(controller.create));
  router.put(`${path}/:id`, asyncHandler(controller.update));
  router.delete(`${path}/:id`, asyncHandler(controller.remove));
}

// --- Catalogues partagés (écriture réservée à l'ADMIN) ---
mount(
  '/competences',
  crudFactory('competence', 'id_competence', { fields: ['nom', 'description'], adminOnlyWrite: true })
);
mount(
  '/projets',
  crudFactory('projet', 'id_projet', {
    fields: ['nom', 'description', 'date_debut', 'date_fin', 'statut'],
    adminOnlyWrite: true,
  })
);
mount(
  '/badges',
  crudFactory('badge', 'id_badge', {
    fields: ['nom', 'description', 'condition_obtention'],
    adminOnlyWrite: true,
  })
);
mount(
  '/opportunites',
  crudFactory('opportunite', 'id_opportunite', {
    fields: ['titre', 'description', 'type', 'organisme', 'lien', 'date_limite'],
    adminOnlyWrite: true,
  })
);

// --- Tables de jonction liées à l'utilisateur connecté (clé composite) ---
router.get(
  '/mes-competences',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT uc.id_competence, uc.niveau, c.nom, c.description
       FROM utilisateur_competence uc
       JOIN competence c ON c.id_competence = uc.id_competence
       WHERE uc.id_utilisateur = ?`,
      [req.user.id_utilisateur]
    );
    res.json(rows);
  })
);
router.post(
  '/mes-competences',
  asyncHandler(async (req, res) => {
    const { id_competence, niveau } = req.body;
    await pool.query(
      'INSERT INTO utilisateur_competence (id_utilisateur, id_competence, niveau) VALUES (?,?,?)',
      [req.user.id_utilisateur, id_competence, niveau || null]
    );
    res.status(201).json({ id_utilisateur: req.user.id_utilisateur, id_competence, niveau });
  })
);
router.delete(
  '/mes-competences/:id_competence',
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM utilisateur_competence WHERE id_utilisateur = ? AND id_competence = ?', [
      req.user.id_utilisateur,
      req.params.id_competence,
    ]);
    res.json({ message: 'Supprimé' });
  })
);

router.get(
  '/mes-projets',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT p.* FROM utilisateur_projet up
       JOIN projet p ON p.id_projet = up.id_projet
       WHERE up.id_utilisateur = ?`,
      [req.user.id_utilisateur]
    );
    res.json(rows);
  })
);
router.post(
  '/mes-projets',
  asyncHandler(async (req, res) => {
    const { id_projet } = req.body;
    await pool.query('INSERT INTO utilisateur_projet (id_utilisateur, id_projet) VALUES (?,?)', [
      req.user.id_utilisateur,
      id_projet,
    ]);
    res.status(201).json({ id_utilisateur: req.user.id_utilisateur, id_projet });
  })
);
router.delete(
  '/mes-projets/:id_projet',
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM utilisateur_projet WHERE id_utilisateur = ? AND id_projet = ?', [
      req.user.id_utilisateur,
      req.params.id_projet,
    ]);
    res.json({ message: 'Supprimé' });
  })
);

router.get(
  '/mes-badges',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT ub.date_obtention, b.* FROM utilisateur_badge ub
       JOIN badge b ON b.id_badge = ub.id_badge
       WHERE ub.id_utilisateur = ?`,
      [req.user.id_utilisateur]
    );
    res.json(rows);
  })
);
router.post(
  '/mes-badges',
  asyncHandler(async (req, res) => {
    // Attribution réservée à l'ADMIN ou à une future logique métier automatique
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Réservé aux administrateurs' });
    const { id_utilisateur, id_badge } = req.body;
    await pool.query('INSERT INTO utilisateur_badge (id_utilisateur, id_badge) VALUES (?,?)', [
      id_utilisateur,
      id_badge,
    ]);
    res.status(201).json({ id_utilisateur, id_badge });
  })
);

router.get(
  '/competences-projet/:id_projet',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT c.* FROM competence_projet cp
       JOIN competence c ON c.id_competence = cp.id_competence
       WHERE cp.id_projet = ?`,
      [req.params.id_projet]
    );
    res.json(rows);
  })
);

router.get(
  '/competences-opportunite/:id_opportunite',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT c.* FROM competence_opportunite co
       JOIN competence c ON c.id_competence = co.id_competence
       WHERE co.id_opportunite = ?`,
      [req.params.id_opportunite]
    );
    res.json(rows);
  })
);

module.exports = router;
