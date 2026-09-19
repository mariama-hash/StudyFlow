const pool = require('../config/db');

const DEFAULT_BUDGET_NAME = 'Budget mensuel';

async function ensureDefaultBudget(userId) {
  const { rows } = await pool.query(
    'SELECT id_budget FROM budget WHERE id_utilisateur = $1 AND nom = $2 LIMIT 1',
    [userId, DEFAULT_BUDGET_NAME]
  );
  if (rows.length) return rows[0].id_budget;
  const { rows: r } = await pool.query(
    'INSERT INTO budget (nom, montant_initial, date_debut, id_utilisateur) VALUES ($1,0,CURRENT_DATE,$2) RETURNING id_budget',
    [DEFAULT_BUDGET_NAME, userId]
  );
  return r[0].id_budget;
}

async function ensureCategorie(nom) {
  const { rows } = await pool.query('SELECT id_categorie FROM categorie_depense WHERE nom = $1 LIMIT 1', [nom]);
  if (rows.length) return rows[0].id_categorie;
  const { rows: r } = await pool.query(
    'INSERT INTO categorie_depense (nom) VALUES ($1) RETURNING id_categorie',
    [nom]
  );
  return r[0].id_categorie;
}

module.exports = { ensureDefaultBudget, ensureCategorie };
