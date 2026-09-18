const pool = require('../config/db');

const DEFAULT_ETABLISSEMENT = 'Mon établissement';
const DEFAULT_FORMATION = 'Mon programme';

function currentAcademicYear() {
  const now = new Date();
  const y = now.getFullYear();
  const start = now.getMonth() >= 8 ? y : y - 1; // l'année académique démarre en septembre
  return `${start}-${start + 1}`;
}

/**
 * Le schéma StudyFlow rattache une UE à un semestre -> une inscription -> un utilisateur.
 * Pour permettre au frontend d'ajouter une UE sans configurer tout ce parcours à la main,
 * on provisionne (une seule fois) un établissement/formation/inscription/semestre "par défaut"
 * pour l'utilisateur, et on renvoie l'id_semestre courant.
 */
async function ensureDefaultSemestre(userId) {
  let [rows] = await pool.query('SELECT id_etablissement FROM etablissement WHERE nom = ? LIMIT 1', [
    DEFAULT_ETABLISSEMENT,
  ]);
  let idEtablissement = rows.length
    ? rows[0].id_etablissement
    : (await pool.query('INSERT INTO etablissement (nom) VALUES (?)', [DEFAULT_ETABLISSEMENT]))[0].insertId;

  [rows] = await pool.query(
    'SELECT id_formation FROM formation WHERE nom = ? AND id_etablissement = ? LIMIT 1',
    [DEFAULT_FORMATION, idEtablissement]
  );
  let idFormation = rows.length
    ? rows[0].id_formation
    : (
        await pool.query('INSERT INTO formation (nom, id_etablissement) VALUES (?,?)', [
          DEFAULT_FORMATION,
          idEtablissement,
        ])
      )[0].insertId;

  [rows] = await pool.query(
    'SELECT id_inscription FROM inscription WHERE id_utilisateur = ? AND id_formation = ? LIMIT 1',
    [userId, idFormation]
  );
  let idInscription = rows.length
    ? rows[0].id_inscription
    : (
        await pool.query(
          'INSERT INTO inscription (id_utilisateur, id_formation, date_inscription) VALUES (?,?,CURDATE())',
          [userId, idFormation]
        )
      )[0].insertId;

  const annee = currentAcademicYear();
  [rows] = await pool.query(
    'SELECT id_semestre FROM semestre WHERE id_inscription = ? AND annee_academique = ? LIMIT 1',
    [idInscription, annee]
  );
  if (rows.length) return rows[0].id_semestre;

  const [r] = await pool.query(
    'INSERT INTO semestre (numero, annee_academique, id_inscription) VALUES (1, ?, ?)',
    [annee, idInscription]
  );
  return r.insertId;
}

module.exports = { ensureDefaultSemestre };
