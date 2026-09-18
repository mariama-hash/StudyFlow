const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
}

exports.register = async (req, res) => {
  const { nom, prenom, email, mot_de_passe } = req.body;
  if (!nom || !prenom || !email || !mot_de_passe) {
    return res.status(400).json({ error: 'nom, prenom, email et mot_de_passe sont requis' });
  }

  const [existing] = await pool.query('SELECT id_utilisateur FROM utilisateur WHERE email = ?', [email]);
  if (existing.length) return res.status(409).json({ error: 'Cet email est déjà utilisé' });

  const hash = await bcrypt.hash(mot_de_passe, 10);
  const [result] = await pool.query(
    'INSERT INTO utilisateur (nom, prenom, email, mot_de_passe, role) VALUES (?,?,?,?,?)',
    [nom, prenom, email, hash, 'ETUDIANT']
  );

  const token = signToken({ id_utilisateur: result.insertId, role: 'ETUDIANT', email });
  res.status(201).json({
    token,
    utilisateur: { id_utilisateur: result.insertId, nom, prenom, email, role: 'ETUDIANT' },
  });
};

exports.login = async (req, res) => {
  const { email, mot_de_passe } = req.body;
  if (!email || !mot_de_passe) {
    return res.status(400).json({ error: 'email et mot_de_passe sont requis' });
  }

  const [rows] = await pool.query('SELECT * FROM utilisateur WHERE email = ?', [email]);
  if (!rows.length) return res.status(401).json({ error: 'Identifiants invalides' });

  const user = rows[0];
  const valid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
  if (!valid) return res.status(401).json({ error: 'Identifiants invalides' });

  const token = signToken({ id_utilisateur: user.id_utilisateur, role: user.role, email: user.email });
  res.json({
    token,
    utilisateur: {
      id_utilisateur: user.id_utilisateur,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      role: user.role,
    },
  });
};

exports.me = async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id_utilisateur, nom, prenom, email, role, date_inscription FROM utilisateur WHERE id_utilisateur = ?',
    [req.user.id_utilisateur]
  );
  if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json(rows[0]);
};

exports.updateMe = async (req, res) => {
  const { nom, prenom, email } = req.body;
  await pool.query(
    'UPDATE utilisateur SET nom = COALESCE(?, nom), prenom = COALESCE(?, prenom), email = COALESCE(?, email) WHERE id_utilisateur = ?',
    [nom || null, prenom || null, email || null, req.user.id_utilisateur]
  );
  res.json({ message: 'Profil mis à jour' });
};

// Réservé à l'ADMIN
exports.listUsers = async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id_utilisateur, nom, prenom, email, role, date_inscription FROM utilisateur'
  );
  res.json(rows);
};
