// Client Groq — le SEUL endroit du backend qui parle à l'IA.
// Le navigateur n'a jamais accès à la clé ni à l'URL de Groq : flux Utilisateur → Backend → IA.
//
// Groq expose une API compatible OpenAI : un simple POST suffit, pas de SDK à installer
// (fetch natif, Node >= 18, déjà exigé par bcrypt 6).

const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_TIMEOUT_MS = 30000;

// gpt-oss est un modèle « raisonnant » : ses tokens de réflexion comptent dans la limite de sortie.
// Nos tâches (JSON court) n'ont pas besoin d'une longue réflexion : "low" = réponse plus rapide,
// moins de quota consommé. Groq rejette (400) toute autre valeur que low / medium / high.
const EFFORTS = ['low', 'medium', 'high'];

// Erreur « prévue » : le message est déjà écrit pour l'utilisateur, errorHandler le renvoie tel quel.
// Important : on ne relaie JAMAIS un 401/403 de Groq au client, sinon le frontend croirait à une
// session expirée et déconnecterait l'étudiant alors que c'est la clé serveur qui pose problème.
class AiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.expose = true;
  }
}

/**
 * Envoie une conversation au modèle et renvoie le texte de sa réponse.
 * messages : [{ role: 'system' | 'user' | 'assistant', content: string }]
 */
async function chat(messages, { temperature = 0.7, maxTokens = 3000 } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[IA] GROQ_API_KEY manquante dans le .env');
    throw new AiError(503, "L'assistant IA n'est pas configuré côté serveur.");
  }

  const baseUrl = (process.env.GROQ_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
  const timeoutMs = Number(process.env.GROQ_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const effort = EFFORTS.includes(process.env.GROQ_REASONING_EFFORT) ? process.env.GROQ_REASONING_EFFORT : 'low';

  // On coupe plutôt que de laisser l'étudiant attendre indéfiniment.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  let brut;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_completion_tokens: maxTokens,
        reasoning_effort: effort,
      }),
    });
    brut = await res.text(); // lu ici pour que le délai couvre aussi le corps de la réponse
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AiError(504, "L'assistant met trop de temps à répondre, réessaie dans un instant.");
    }
    console.error('[IA] Groq injoignable :', err.message);
    throw new AiError(502, "Impossible de joindre l'assistant IA pour le moment.");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    console.error('[IA] Groq a répondu', res.status, ':', brut.slice(0, 500));
    if (res.status === 429) {
      // Quota par minute ou par jour de la clé, partagé entre tous les étudiants
      throw new AiError(429, "L'assistant est très sollicité, réessaie dans quelques instants.");
    }
    throw new AiError(502, "L'assistant IA est momentanément indisponible.");
  }

  let data;
  try {
    data = JSON.parse(brut);
  } catch (err) {
    console.error('[IA] Réponse Groq non JSON :', brut.slice(0, 300));
    throw new AiError(502, "L'assistant a renvoyé une réponse illisible, réessaie.");
  }

  const choix = data.choices && data.choices[0];
  const texte = choix && choix.message && choix.message.content;
  if (typeof texte !== 'string' || !texte.trim()) {
    // finish_reason "length" = la réflexion a mangé toute la limite de sortie
    console.error('[IA] Réponse vide (finish_reason :', choix && choix.finish_reason, ')');
    throw new AiError(502, "L'assistant n'a rien renvoyé, réessaie.");
  }
  return texte.trim();
}

/**
 * Extrait l'objet JSON d'une réponse du modèle. Il ajoute parfois du texte ou des balises ```json
 * autour malgré la consigne : on garde ce qui est entre la première « { » et la dernière « } ».
 */
function parseJson(texte) {
  const illisible = () => {
    console.error('[IA] JSON illisible :', String(texte).slice(0, 300));
    return new AiError(502, "L'assistant a renvoyé une réponse mal formée, réessaie.");
  };

  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut === -1 || fin <= debut) throw illisible();

  let obj;
  try {
    obj = JSON.parse(texte.slice(debut, fin + 1));
  } catch (err) {
    throw illisible();
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw illisible();
  return obj;
}

module.exports = { chat, parseJson, AiError };
