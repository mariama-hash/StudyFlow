const pool = require('../config/db');

exports.getMine = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM preference_notification WHERE id_utilisateur = ?', [
    req.user.id_utilisateur,
  ]);
  res.json(rows.length ? rows[0] : null);
};

exports.upsertMine = async (req, res) => {
  const { notifications_application, notifications_email, heure_debut, heure_fin } = req.body;
  const [existing] = await pool.query(
    'SELECT id_preference FROM preference_notification WHERE id_utilisateur = ?',
    [req.user.id_utilisateur]
  );

  if (existing.length) {
    await pool.query(
      `UPDATE preference_notification
       SET notifications_application = ?, notifications_email = ?, heure_debut = ?, heure_fin = ?
       WHERE id_utilisateur = ?`,
      [
        notifications_application ?? true,
        notifications_email ?? false,
        heure_debut || null,
        heure_fin || null,
        req.user.id_utilisateur,
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO preference_notification
        (notifications_application, notifications_email, heure_debut, heure_fin, id_utilisateur)
       VALUES (?,?,?,?,?)`,
      [
        notifications_application ?? true,
        notifications_email ?? false,
        heure_debut || null,
        heure_fin || null,
        req.user.id_utilisateur,
      ]
    );
  }

  const [rows] = await pool.query('SELECT * FROM preference_notification WHERE id_utilisateur = ?', [
    req.user.id_utilisateur,
  ]);
  res.json(rows[0]);
};
