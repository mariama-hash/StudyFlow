const express = require('express');
const router = express.Router();
const crudFactory = require('../utils/crudFactory');
const asyncHandler = require('../utils/asyncHandler');

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

mount(
  '/depenses',
  crudFactory('depense', 'id_depense', {
    fields: ['montant', 'description', 'date_depense', 'imprevue', 'id_budget', 'id_categorie'],
    chainConfig: {
      fkColumn: 'id_budget',
      chain: [{ table: 'budget', pk: 'id_budget', fk: 'id_utilisateur' }],
    },
  })
);

module.exports = router;
