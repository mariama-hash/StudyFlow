// Client OpenRouter — le SEUL endroit du backend qui parle à l'IA.
// Le navigateur n'a jamais accès à la clé ni à l'URL d'OpenRouter : flux Utilisateur → Backend → IA.
//
// Pas de dépendance ajoutée : on utilise le fetch natif (Node >= 18, déjà exigé par bcrypt 6).

const DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it:free';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 45000;

// Erreur « prévue » : le message est déjà écrit pour l'utilisateur, errorHandler le renvoie tel quel.
// Important : on ne relaie JAMAIS un 401/402/403 d'OpenRouter au client, sinon le frontend
// croirait à une session expirée et déconnecterait l'étudiant alors que c'est la clé serveur qui pose problème.
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
async function chat(messages, { temperature = 0.7, maxTokens = 2000 } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('[IA] OPENROUTER_API_KEY manquante dans le .env');
    throw new AiError(503, "L'assistant IA n'est pas configuré côté serveur.");
  }

  const baseUrl = (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const timeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  // Un modèle gratuit peut rester silencieux longtemps : on coupe plutôt que de bloquer l'étudiant.
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
        'X-Title': 'StudyFlow',
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    });
    brut = await res.text(); // lu ici pour que le délai couvre aussi le corps de la réponse
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AiError(504, "L'assistant met trop de temps à répondre, réessaie dans un instant.");
    }
    console.error("[IA] OpenRouter injoignable :", err.message);
    throw new AiError(502, "Impossible de joindre l'assistant IA pour le moment.");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    console.error('[IA] OpenRouter a répondu', res.status, ':', brut.slice(0, 500));
    if (res.status === 429) {
      // Le quota des modèles gratuits est partagé et vite atteint
      throw new AiError(429, "L'assistant est très sollicité, réessaie dans quelques instants.");
    }
    throw new AiError(502, "L'assistant IA est momentanément indisponible.");
  }

  let data;
  try {
    data = JSON.parse(brut);
  } catch (err) {
    console.error('[IA] Réponse OpenRouter non JSON :', brut.slice(0, 300));
    throw new AiError(502, "L'assistant a renvoyé une réponse illisible, réessaie.");
  }

  const texte = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof texte !== 'string' || !texte.trim()) {
    // OpenRouter peut répondre 200 avec un objet { error } dans le corps
    console.error('[IA] Réponse vide :', JSON.stringify(data.error || data).slice(0, 300));
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
