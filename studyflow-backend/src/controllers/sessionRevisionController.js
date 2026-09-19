const pool = require('../config/db');
const { resolveOwnerId } = require('../utils/ownership');

// session_revision peut être rattachée à un objectif ET/OU à une UE (les deux sont
// facultatifs dans le schéma). On vérifie la propriété via l'une ou l'autre voie.
const UE_CHAIN = [
  { table: 'ue', pk: 'id_ue', fk: 'id_semestre' },
  { table: 'semestre', pk: 'id_semestre', fk: 'id_inscription' },
  { table: 'inscription', pk: 'id_inscription', fk: 'id_utilisateur' },
];

async function ownsSession(row, userId) {
  if (row.id_objectif) {
    const { rows } = await pool.query('SELECT id_utilisateur FROM objectif WHERE id_objectif = $1', [
      row.id_objectif,
    ]);
    if (rows.length && Number(rows[0].id_utilisateur) === Number(userId)) return true;
  }
  if (row.id_ue) {
    const ownerId = await resolveOwnerId(UE_CHAIN, row.id_ue);
    if (ownerId !== null && Number(ownerId) === Number(userId)) return true;
  }
  return false;
}

exports.getAll = async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  const { rows } = await pool.query(
    `
    SELECT DISTINCT sr.* FROM session_revision sr
    LEFT JOIN objectif o ON sr.id_objectif = o.id_objectif
    LEFT JOIN ue u ON sr.id_ue = u.id_ue
    LEFT JOIN semestre s ON u.id_semestre = s.id_semestre
    LEFT JOIN inscription i ON s.id_inscription = i.id_inscription
    WHERE $1 OR o.id_utilisateur = $2 OR i.id_utilisateur = $3
    `,
    [isAdmin, req.user.id_utilisateur, req.user.id_utilisateur]
  );
  res.json(rows);
};

exports.getOne = async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM session_revision WHERE id_session = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
  const row = rows[0];
  if (req.user.role !== 'ADMIN' && !(await ownsSession(row, req.user.id_utilisateur))) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  res.json(row);
};

exports.create = async (req, res) => {
  const { date_session, heure_debut, heure_fin, duree, statut, id_objectif, id_ue } = req.body;
  if (!date_session || !statut) {
    return res.status(400).json({ error: 'date_session et statut sont requis' });
  }
  if (!id_objectif && !id_ue) {
    return res.status(400).json({ error: 'id_objectif ou id_ue est requis' });
  }
  if (req.user.role !== 'ADMIN' && !(await ownsSession({ id_objectif, id_ue }, req.user.id_utilisateur))) {
    return res.status(403).json({ error: 'Accès refusé à cette ressource parente' });
  }
  const { rows: result } = await pool.query(
    `INSERT INTO session_revision (date_session, heure_debut, heure_fin, duree, statut, id_objectif, id_ue)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id_session`,
    [date_session, heure_debut || null, heure_fin || null, duree || null, statut, id_objectif || null, id_ue || null]
  );
  res.status(201).json({ id_session: result[0].id_session, ...req.body });
};

exports.update = async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM session_revision WHERE id_session = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
  const row = rows[0];
  if (req.user.role !== 'ADMIN' && !(await ownsSession(row, req.user.id_utilisateur))) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  const fields = ['date_session', 'heure_debut', 'heure_fin', 'duree', 'statut'];
  const data = {};
  for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
  const cols = Object.keys(data);
  if (!cols.length) return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
  const setSql = cols.map((c, i) => `${c} = $${i + 1}`).join(',');
  await pool.query(`UPDATE session_revision SET ${setSql} WHERE id_session = $${cols.length + 1}`, [
    ...cols.map((c) => data[c]),
    req.params.id,
  ]);
  res.json({ message: 'Mis à jour' });
};

exports.remove = async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM session_revision WHERE id_session = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
  const row = rows[0];
  if (req.user.role !== 'ADMIN' && !(await ownsSession(row, req.user.id_utilisateur))) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  await pool.query('DELETE FROM session_revision WHERE id_session = $1', [req.params.id]);
  res.json({ message: 'Supprimé' });
};
