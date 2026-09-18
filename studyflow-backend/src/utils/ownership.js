const pool = require('../config/db');

/**
 * Remonte une chaîne de clés étrangères pour retrouver l'id_utilisateur propriétaire final.
 *
 * chain: [{ table, pk, fk }, ...]
 *   - Le premier maillon décrit la table pointée par la clé étrangère de départ.
 *   - Le dernier maillon doit avoir fk = 'id_utilisateur' (colonne de propriété directe).
 *
 * Exemple pour une UE (dont la FK id_semestre est fournie) :
 *   [
 *     { table: 'semestre',    pk: 'id_semestre',    fk: 'id_inscription' },
 *     { table: 'inscription', pk: 'id_inscription', fk: 'id_utilisateur' },
 *   ]
 */
async function resolveOwnerId(chain, startValue) {
  let currentId = startValue;
  for (const step of chain) {
    const [rows] = await pool.query(
      `SELECT \`${step.fk}\` AS v FROM \`${step.table}\` WHERE \`${step.pk}\` = ?`,
      [currentId]
    );
    if (!rows.length || rows[0].v === null || rows[0].v === undefined) return null;
    currentId = rows[0].v;
  }
  return currentId;
}

/**
 * Construit une clause SQL (avec un seul "?" à substituer par l'id_utilisateur)
 * qui filtre une table selon le propriétaire final, en remontant la même chaîne.
 *
 * fkColumn : la colonne de la table courante qui référence chain[0].table.
 */
function buildNestedWhere(fkColumn, chain) {
  const last = chain[chain.length - 1];
  let sql = `SELECT \`${last.pk}\` FROM \`${last.table}\` WHERE \`${last.fk}\` = ?`;
  for (let i = chain.length - 2; i >= 0; i--) {
    const step = chain[i];
    sql = `SELECT \`${step.pk}\` FROM \`${step.table}\` WHERE \`${step.fk}\` IN (${sql})`;
  }
  return `\`${fkColumn}\` IN (${sql})`;
}

module.exports = { resolveOwnerId, buildNestedWhere };
