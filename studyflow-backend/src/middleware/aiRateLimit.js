// Limite les appels à l'assistant IA par utilisateur.
// Pourquoi : tous les étudiants partagent UNE clé OpenRouter (et son quota gratuit). Sans garde-fou,
// un seul compte qui spamme « Générer » suffirait à bloquer l'assistant pour tout le monde.
//
// En mémoire, volontairement : pas de dépendance en plus (express-rate-limit) pour ce besoin simple.
// Limite : le compteur repart à zéro au redémarrage et n'est pas partagé entre plusieurs instances.
// Si le backend passe en multi-instances, il faudra un stockage commun (Redis, par exemple).

const FENETRE_MS = 60 * 1000;
const MAX_PAR_FENETRE = Number(process.env.AI_RATE_LIMIT_PER_MIN) || 6;

const appels = new Map(); // id_utilisateur -> horodatages des appels récents

// Ménage régulier pour ne pas garder en mémoire les utilisateurs partis
setInterval(() => {
  const limite = Date.now() - FENETRE_MS;
  for (const [id, horodatages] of appels) {
    if (!horodatages.some((t) => t > limite)) appels.delete(id);
  }
}, FENETRE_MS).unref();

module.exports = function aiRateLimit(req, res, next) {
  const maintenant = Date.now();
  const recents = (appels.get(req.user.id_utilisateur) || []).filter((t) => maintenant - t < FENETRE_MS);

  if (recents.length >= MAX_PAR_FENETRE) {
    const attente = Math.ceil((FENETRE_MS - (maintenant - recents[0])) / 1000);
    res.set('Retry-After', String(attente));
    return res
      .status(429)
      .json({ error: `Trop de demandes à l'assistant. Patiente ${attente} s avant de réessayer.` });
  }

  recents.push(maintenant);
  appels.set(req.user.id_utilisateur, recents);
  next();
};
