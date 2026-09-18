const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const crudFactory = require('../utils/crudFactory');
const asyncHandler = require('../utils/asyncHandler');
const { ensureDefaultBudget, ensureCategorie } = require('../utils/defaultEconomic');

function mount(path, controller) {
  router.get(path, asyncHandler(controller.getAll));
  router.get(`${path}/:id`, asyncHandler(controller.getOne));
  router.post(path, asyncHandler(controller.create));
  router.put(`${path}/:id`, asyncHandler(controller.update));
  router.delete(`${path}/:id`, asyncHandler(controller.remove));
}

mount(
  '/budgets',
  crudFactory('budget', 'id_budget', {
    fields: ['nom', 'montant_initial', 'date_debut', 'date_fin'],
    scopeField: 'id_utilisateur',
  })
);

// Catalogue simple, ouvert en écriture à tout utilisateur authentifié
mount(
  '/categories-depense',
  crudFactory('categorie_depense', 'id_categorie', {
    fields: ['nom', 'description'],
  })
);

// dépenses : id_budget et id_categorie sont requis par le schéma. On accepte que le
// frontend fournisse un budget/catégorie implicites (le "budget courant" de l'utilisateur,
// une catégorie par son nom) plutôt que de forcer les id à chaque appel.
const depenseController = crudFactory('depense', 'id_depense', {
  fields: ['montant', 'description', 'date_depense', 'imprevue', 'id_budget', 'id_categorie'],
  chainConfig: {
    fkColumn: 'id_budget',
    chain: [{ table: 'budget', pk: 'id_budget', fk: 'id_utilisateur' }],
  },
});
router.get('/depenses', asyncHandler(depenseController.getAll));
router.get('/depenses/:id', asyncHandler(depenseController.getOne));
router.post(
  '/depenses',
  asyncHandler(async (req, res, next) => {
    if (!req.body.id_budget) {
      req.body.id_budget = await ensureDefaultBudget(req.user.id_utilisateur);
    }
    if (!req.body.id_categorie && req.body.categorie) {
      req.body.id_categorie = await ensureCategorie(req.body.categorie);
    }
    if (!req.body.date_depense) {
      req.body.date_depense = new Date().toISOString().slice(0, 10);
    }
    return depenseController.create(req, res, next);
  })
);
router.put('/depenses/:id', asyncHandler(depenseController.update));
router.delete('/depenses/:id', asyncHandler(depenseController.remove));

// --- Budget courant (convenience) ---
// Le prototype gère un unique "budget du mois" + une réserve pour imprévus. Le schéma
// n'a pas de colonne dédiée à cette réserve : on la modélise comme une ligne de
// `depense` spéciale (imprevue = TRUE, description = 'Réserve imprévus'), ce qui reste
// cohérent avec le sens de la colonne `imprevue` déjà prévue dans le schéma.
const RESERVE_LABEL = 'Réserve imprévus';

router.get(
  '/budget-courant',
  asyncHandler(async (req, res) => {
    const idBudget = await ensureDefaultBudget(req.user.id_utilisateur);
    const [budgetRows] = await pool.query('SELECT * FROM budget WHERE id_budget = ?', [idBudget]);
    const [reserveRows] = await pool.query(
      `SELECT montant FROM depense WHERE id_budget = ? AND imprevue = TRUE AND description = ? LIMIT 1`,
      [idBudget, RESERVE_LABEL]
    );
    const [depenses] = await pool.query(
      `SELECT d.*, c.nom AS categorie FROM depense d
       JOIN categorie_depense c ON c.id_categorie = d.id_categorie
       WHERE d.id_budget = ? AND NOT (d.imprevue = TRUE AND d.description = ?)
       ORDER BY d.id_depense DESC`,
      [idBudget, RESERVE_LABEL]
    );
    res.json({
      budget: budgetRows[0],
      reserve_imprevus: reserveRows.length ? Number(reserveRows[0].montant) : 0,
      depenses,
    });
  })
);

router.put(
  '/budget-courant',
  asyncHandler(async (req, res) => {
    const { montant, imprevu } = req.body;
    const idBudget = await ensureDefaultBudget(req.user.id_utilisateur);
    await pool.query('UPDATE budget SET montant_initial = ? WHERE id_budget = ?', [montant || 0, idBudget]);

    const idCategorie = await ensureCategorie('Réserve');
    const [existing] = await pool.query(
      `SELECT id_depense FROM depense WHERE id_budget = ? AND imprevue = TRUE AND description = ? LIMIT 1`,
      [idBudget, RESERVE_LABEL]
    );
    if (existing.length) {
      await pool.query('UPDATE depense SET montant = ? WHERE id_depense = ?', [imprevu || 0, existing[0].id_depense]);
    } else {
      await pool.query(
        `INSERT INTO depense (montant, description, date_depense, imprevue, id_budget, id_categorie)
         VALUES (?,?,CURDATE(),TRUE,?,?)`,
        [imprevu || 0, RESERVE_LABEL, idBudget, idCategorie]
      );
    }
    res.json({ message: 'Budget mis à jour' });
  })
);

module.exports = router;
