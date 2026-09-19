const pool = require('../config/db');
const { resolveOwnerId, buildNestedWhere } = require('./ownership');

/**
 * Crée un jeu de contrôleurs CRUD (getAll, getOne, create, update, remove) pour une table
 * dont la clé primaire est une colonne unique.
 *
 * options:
 *  - fields         : colonnes acceptées en écriture (create/update)
 *  - scopeField     : colonne de propriété directe (ex: 'id_utilisateur') — l'utilisateur
 *                      ne voit/modifie que ses propres lignes, l'ADMIN voit tout
 *  - chainConfig    : { fkColumn, chain } pour une propriété retrouvée via une chaîne de
 *                      clés étrangères (voir utils/ownership.js)
 *  - adminOnlyWrite : si true, seul un ADMIN peut créer/modifier/supprimer (catalogue partagé)
 */
function crudFactory(table, pk, opts = {}) {
  const { fields = [], scopeField = null, chainConfig = null, adminOnlyWrite = false } = opts;

  const isAdmin = (req) => req.user && req.user.role === 'ADMIN';

  async function ownsViaChain(fkValue, userId) {
    const ownerId = await resolveOwnerId(chainConfig.chain, fkValue);
    return ownerId !== null && Number(ownerId) === Number(userId);
  }

  async function checkRowOwnership(req, row) {
    if (isAdmin(req)) return true;
    if (scopeField) return row[scopeField] === req.user.id_utilisateur;
    if (chainConfig) return ownsViaChain(row[chainConfig.fkColumn], req.user.id_utilisateur);
    return true; // pas de restriction de propriété (catalogue en lecture)
  }

  function pickFields(body) {
    const data = {};
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    return data;
  }

  return {
    getAll: async (req, res) => {
      let sql = `SELECT * FROM ${table}`;
      const params = [];
      if (scopeField && !isAdmin(req)) {
        sql += ` WHERE ${scopeField} = $1`;
        params.push(req.user.id_utilisateur);
      } else if (chainConfig && !isAdmin(req)) {
        sql += ` WHERE ${buildNestedWhere(chainConfig.fkColumn, chainConfig.chain)}`;
        params.push(req.user.id_utilisateur);
      }
      const { rows } = await pool.query(sql, params);
      res.json(rows);
    },

    getOne: async (req, res) => {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE ${pk} = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
      const row = rows[0];
      if (!(await checkRowOwnership(req, row))) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
      res.json(row);
    },

    create: async (req, res) => {
      if (adminOnlyWrite && !isAdmin(req)) {
        return res.status(403).json({ error: 'Réservé aux administrateurs' });
      }
      const data = pickFields(req.body);

      if (scopeField) {
        data[scopeField] = req.user.id_utilisateur; // propriété forcée, jamais fournie par le client
      } else if (chainConfig) {
        const fkValue = data[chainConfig.fkColumn];
        if (fkValue === undefined || fkValue === null) {
          return res.status(400).json({ error: `${chainConfig.fkColumn} est requis` });
        }
        if (!isAdmin(req) && !(await ownsViaChain(fkValue, req.user.id_utilisateur))) {
          return res.status(403).json({ error: 'Accès refusé à cette ressource parente' });
        }
      }

      const cols = Object.keys(data);
      if (!cols.length) return res.status(400).json({ error: 'Aucune donnée fournie' });
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) RETURNING ${pk}`,
        cols.map((c) => data[c])
      );
      res.status(201).json({ [pk]: rows[0][pk], ...data });
    },

    update: async (req, res) => {
      if (adminOnlyWrite && !isAdmin(req)) {
        return res.status(403).json({ error: 'Réservé aux administrateurs' });
      }
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE ${pk} = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
      const row = rows[0];
      if (!(await checkRowOwnership(req, row))) {
        return res.status(403).json({ error: 'Accès refusé' });
      }

      const data = pickFields(req.body);
      if (scopeField) delete data[scopeField]; // on ne réassigne jamais le propriétaire
      const cols = Object.keys(data);
      if (!cols.length) return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
      const setSql = cols.map((c, i) => `${c} = $${i + 1}`).join(',');
      await pool.query(`UPDATE ${table} SET ${setSql} WHERE ${pk} = $${cols.length + 1}`, [
        ...cols.map((c) => data[c]),
        req.params.id,
      ]);
      res.json({ message: 'Mis à jour' });
    },

    remove: async (req, res) => {
      if (adminOnlyWrite && !isAdmin(req)) {
        return res.status(403).json({ error: 'Réservé aux administrateurs' });
      }
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE ${pk} = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
      const row = rows[0];
      if (!(await checkRowOwnership(req, row))) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
      await pool.query(`DELETE FROM ${table} WHERE ${pk} = $1`, [req.params.id]);
      res.json({ message: 'Supprimé' });
    },
  };
}

module.exports = crudFactory;
