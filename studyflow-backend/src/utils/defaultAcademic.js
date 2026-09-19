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
  let { rows } = await pool.query('SELECT id_etablissement FROM etablissement WHERE nom = $1 LIMIT 1', [
    DEFAULT_ETABLISSEMENT,
  ]);
  let idEtablissement = rows.length
    ? rows[0].id_etablissement
    : (
        await pool.query('INSERT INTO etablissement (nom) VALUES ($1) RETURNING id_etablissement', [
          DEFAULT_ETABLISSEMENT,
        ])
      ).rows[0].id_etablissement;

  ({ rows } = await pool.query(
    'SELECT id_formation FROM formation WHERE nom = $1 AND id_etablissement = $2 LIMIT 1',
    [DEFAULT_FORMATION, idEtablissement]
  ));
  let idFormation = rows.length
    ? rows[0].id_formation
    : (
        await pool.query('INSERT INTO formation (nom, id_etablissement) VALUES ($1,$2) RETURNING id_formation', [
          DEFAULT_FORMATION,
          idEtablissement,
        ])
      ).rows[0].id_formation;

  ({ rows } = await pool.query(
    'SELECT id_inscription FROM inscription WHERE id_utilisateur = $1 AND id_formation = $2 LIMIT 1',
    [userId, idFormation]
  ));
  let idInscription = rows.length
    ? rows[0].id_inscription
    : (
        await pool.query(
          'INSERT INTO inscription (id_utilisateur, id_formation, date_inscription) VALUES ($1,$2,CURRENT_DATE) RETURNING id_inscription',
          [userId, idFormation]
        )
      ).rows[0].id_inscription;

  const annee = currentAcademicYear();
  ({ rows } = await pool.query(
    'SELECT id_semestre FROM semestre WHERE id_inscription = $1 AND annee_academique = $2 LIMIT 1',
    [idInscription, annee]
  ));
  if (rows.length) return rows[0].id_semestre;

  const { rows: r } = await pool.query(
    'INSERT INTO semestre (numero, annee_academique, id_inscription) VALUES (1, $1, $2) RETURNING id_semestre',
    [annee, idInscription]
  );
  return r[0].id_semestre;
}

module.exports = { ensureDefaultSemestre };
