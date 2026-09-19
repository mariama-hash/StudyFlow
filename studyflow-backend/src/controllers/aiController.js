const pool = require('../config/db');
const { chat, parseJson, AiError } = require('../utils/groq');

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const SYSTEM_PROMPT =
  "Tu es l'assistant de révision de StudyFlow, une application pour étudiants. " +
  "Tu tutoies l'étudiant, tu écris en français, de façon concrète et concise. " +
  'Tu réponds UNIQUEMENT par un objet JSON valide : pas de texte autour, pas de balises markdown.';

// Texte libre venant de l'utilisateur ou du modèle : on l'aplatit et on le borne avant de le
// glisser dans un prompt ou de le renvoyer au client.
function nettoyer(valeur, max) {
  return String(valeur === undefined || valeur === null ? '' : valeur)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// UE de l'étudiant + ce qui aide l'IA à prioriser : moyenne pondérée des notes déjà saisies
// et prochaine évaluation encore sans note. Un seul aller-retour SQL.
async function getUserUEs(userId) {
  const { rows } = await pool.query(
    `SELECT u.id_ue, u.nom, u.credits, u.volume_horaire,
       (SELECT SUM(r.note * e.coefficient) / SUM(e.coefficient)
          FROM evaluation e
          JOIN resultat r ON r.id_evaluation = e.id_evaluation
         WHERE e.id_ue = u.id_ue) AS moyenne,
       (SELECT TO_CHAR(MIN(e.date_evaluation), 'YYYY-MM-DD')
          FROM evaluation e
          LEFT JOIN resultat r ON r.id_evaluation = e.id_evaluation
         WHERE e.id_ue = u.id_ue AND r.id_resultat IS NULL AND e.date_evaluation >= CURRENT_DATE) AS prochaine_eval
     FROM ue u
     JOIN semestre s ON u.id_semestre = s.id_semestre
     JOIN inscription i ON s.id_inscription = i.id_inscription
     WHERE i.id_utilisateur = $1
     ORDER BY u.id_ue ASC`,
    [userId]
  );
  if (!rows.length) {
    throw new AiError(400, "Ajoute d'abord au moins une UE pour utiliser l'assistant.");
  }
  // pg renvoie les DECIMAL/NUMERIC sous forme de chaînes
  return rows.map((u) => ({
    id_ue: u.id_ue,
    nom: u.nom,
    credits: u.credits === null ? null : Number(u.credits),
    volume_horaire: u.volume_horaire === null ? null : Number(u.volume_horaire),
    moyenne: u.moyenne === null ? null : Math.round(Number(u.moyenne) * 10) / 10,
    prochaine_eval: u.prochaine_eval,
  }));
}

function decrire(u) {
  const infos = [];
  if (u.credits) infos.push(`${u.credits} crédits`);
  if (u.volume_horaire) infos.push(`${u.volume_horaire} h`);
  infos.push(u.moyenne !== null ? `moyenne ${u.moyenne}/20` : 'pas encore de note');
  if (u.prochaine_eval) infos.push(`prochaine évaluation le ${u.prochaine_eval}`);
  return `- ${u.nom} (${infos.join(', ')})`;
}

// Sujet du quiz / du mini-projet : l'UE demandée si elle appartient bien à l'étudiant (on ne cherche
// que dans SES UE), sinon la plus fragile côté notes, sinon une au hasard pour varier.
function choisirUE(ues, idDemande) {
  const demandee = ues.find((u) => u.id_ue === Number(idDemande));
  if (demandee) return demandee;
  const notees = ues.filter((u) => u.moyenne !== null);
  if (notees.length) return notees.reduce((a, b) => (b.moyenne < a.moyenne ? b : a));
  return ues[Math.floor(Math.random() * ues.length)];
}

async function ensureBadge(nom, description) {
  const { rows } = await pool.query('SELECT id_badge FROM badge WHERE nom = $1 LIMIT 1', [nom]);
  if (rows.length) return rows[0].id_badge;
  const { rows: r } = await pool.query(
    'INSERT INTO badge (nom, description) VALUES ($1,$2) RETURNING id_badge',
    [nom, description]
  );
  return r[0].id_badge;
}

async function awardBadge(userId, nom, description) {
  const idBadge = await ensureBadge(nom, description);
  const { rows: existing } = await pool.query(
    'SELECT 1 AS x FROM utilisateur_badge WHERE id_utilisateur = $1 AND id_badge = $2',
    [userId, idBadge]
  );
  if (!existing.length) {
    await pool.query('INSERT INTO utilisateur_badge (id_utilisateur, id_badge) VALUES ($1,$2)', [userId, idBadge]);
  }
}

// Les badges ne sont attribués qu'APRÈS une génération réussie : si l'IA échoue, l'étudiant
// ne gagne rien et peut simplement réessayer.

exports.programme = async (req, res) => {
  const userId = req.user.id_utilisateur;
  const ues = await getUserUEs(userId);
  const echeance = nettoyer(req.body.echeance, 120) || 'les prochaines semaines';

  const reponse = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `Date du jour : ${new Date().toISOString().slice(0, 10)}\n` +
          `Échéance de l'étudiant : ${echeance}\n` +
          `Ses UE :\n${ues.map(decrire).join('\n')}\n\n` +
          'Construis son programme de révision pour une semaine type.\n' +
          'Format exact : {"plan":[{"jour":"Lundi","ue":"<nom exact d\'une UE>","creneaux":2}],"conseil":"<2 phrases maximum>"}\n' +
          'Règles : jours parmi Lundi à Samedi (le dimanche reste libre pour se reposer) ; ' +
          'chaque UE apparaît au moins une fois ; "creneaux" est un entier de 1 à 4 (un créneau = environ 1 h) ; ' +
          'donne plus de créneaux aux UE à forts crédits, à moyenne faible ou à évaluation proche.',
      },
    ],
    { temperature: 0.4 }
  );
  const brut = parseJson(reponse);

  // On ne fait pas confiance au modèle : on ne garde que les lignes dont le jour et l'UE existent vraiment.
  const nomsUE = new Map(ues.map((u) => [u.nom.toLowerCase(), u.nom]));
  const plan = (Array.isArray(brut.plan) ? brut.plan : [])
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      jour: JOURS.find((j) => j.toLowerCase() === nettoyer(p.jour, 20).toLowerCase()),
      ue: nomsUE.get(nettoyer(p.ue, 150).toLowerCase()),
      creneaux: Math.min(4, Math.max(1, Math.round(Number(p.creneaux)) || 1)),
    }))
    .filter((p) => p.jour && p.ue);

  if (!plan.length) {
    console.error('[IA] Programme sans ligne exploitable :', JSON.stringify(brut).slice(0, 300));
    throw new AiError(502, "L'assistant a proposé un programme inexploitable, réessaie.");
  }

  await awardBadge(userId, 'Régularité', 'Premier programme de révision généré');
  res.json({ echeance, plan, conseil: nettoyer(brut.conseil, 400) });
};

exports.quiz = async (req, res) => {
  const userId = req.user.id_utilisateur;
  const ues = await getUserUEs(userId);
  const ue = choisirUE(ues, req.body.id_ue);

  const reponse = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `UE à réviser :\n${decrire(ue)}\n\n` +
          `Propose un quiz express de 3 questions à réponse courte sur "${ue.nom}". ` +
          "Adapte la difficulté à la moyenne de l'étudiant si elle est connue. " +
          'Ne donne PAS les réponses.\n' +
          'Format exact : {"questions":["...","...","..."]}',
      },
    ],
    { temperature: 0.7 }
  );
  const brut = parseJson(reponse);

  const questions = (Array.isArray(brut.questions) ? brut.questions : [])
    .filter((q) => typeof q === 'string')
    .map((q) => nettoyer(q, 300))
    .filter(Boolean)
    .slice(0, 5);

  if (!questions.length) {
    throw new AiError(502, "L'assistant n'a pas produit de questions exploitables, réessaie.");
  }

  await awardBadge(userId, 'Premier quiz', "Premier quiz généré par l'assistant");
  res.json({ sujet: ue.nom, questions });
};

exports.projet = async (req, res) => {
  const userId = req.user.id_utilisateur;
  const ues = await getUserUEs(userId);
  const ue = choisirUE(ues, req.body.id_ue);

  const reponse = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `UE concernée :\n${decrire(ue)}\n\n` +
          `Suggère UN mini-projet réalisable en 5 jours qui illustre une notion de "${ue.nom}" ` +
          'et donne un livrable présentable sur un profil (portfolio, GitHub, LinkedIn).\n' +
          'Format exact : {"suggestion":"<le projet, 2 à 3 phrases>","objectif":"<le livrable attendu, 1 phrase>"}',
      },
    ],
    { temperature: 0.8 }
  );
  const brut = parseJson(reponse);

  const suggestion = nettoyer(brut.suggestion, 600);
  const objectif = nettoyer(brut.objectif, 300);
  if (!suggestion) {
    throw new AiError(502, "L'assistant n'a pas produit de suggestion exploitable, réessaie.");
  }

  await awardBadge(userId, 'Mini-projet lancé', "Premier mini-projet suggéré par l'assistant");
  res.json({ sujet: ue.nom, suggestion, objectif });
};
