const pool = require('../config/db');

const DEFAULT_BUDGET_NAME = 'Budget mensuel';

async function ensureDefaultBudget(userId) {
  const [rows] = await pool.query('SELECT id_budget FROM budget WHERE id_utilisateur = ? AND nom = ? LIMIT 1', [
    userId,
    DEFAULT_BUDGET_NAME,
  ]);
  if (rows.length) return rows[0].id_budget;
  const [r] = await pool.query(
    'INSERT INTO budget (nom, montant_initial, date_debut, id_utilisateur) VALUES (?,0,CURDATE(),?)',
    [DEFAULT_BUDGET_NAME, userId]
  );
  return r.insertId;
}

async function ensureCategorie(nom) {
  const [rows] = await pool.query('SELECT id_categorie FROM categorie_depense WHERE nom = ? LIMIT 1', [nom]);
  if (rows.length) return rows[0].id_categorie;
  const [r] = await pool.query('INSERT INTO categorie_depense (nom) VALUES (?)', [nom]);
  return r.insertId;
}

module.exports = { ensureDefaultBudget, ensureCategorie };
