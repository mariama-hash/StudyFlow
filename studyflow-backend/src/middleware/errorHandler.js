module.exports = function errorHandler(err, req, res, next) {
  // Erreurs « prévues » (ex: assistant IA indisponible) : le message est déjà rédigé pour
  // l'utilisateur et le détail technique a été journalisé à la source, on le renvoie tel quel.
  if (err.expose && err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Doublon détecté (contrainte unique violée)' });
  }
  if (err.code && err.code.startsWith('ER_NO_REFERENCED_ROW')) {
    return res.status(400).json({ error: 'Référence invalide (clé étrangère inexistante)' });
  }
  if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ error: 'Suppression impossible : cette ressource est référencée ailleurs' });
  }

  res.status(500).json({ error: 'Erreur interne du serveur' });
};
