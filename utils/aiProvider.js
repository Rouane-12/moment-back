/**
 * Fournisseur IA partagé (multi-providers).
 *
 * Objectif : ne plus dépendre d'une seule clé. On essaie dans l'ordre :
 *   1. Google Gemini (GEMINI_API_KEY)   — modèle le plus récent disponible
 *   2. OpenAI (OPENAI_API_KEY)
 *   3. Perplexity (PERPLEXITY_API_KEY)  — dernier recours
 *
 * Si aucun provider ne répond, `aiGenerateJSON()` lève une erreur et
 * l'appelant retombe sur sa banque locale. Le jeu n'est donc jamais bloqué.
 */

// Gemini retire régulièrement ses anciens modèles pour les nouveaux comptes :
// on essaie plusieurs noms dans l'ordre et on garde le premier qui répond.
const GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
].filter(Boolean);

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';

function getGeminiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
}

function getOpenAIKey() {
  return process.env.OPENAI_API_KEY || null;
}

function getPerplexityKey() {
  return process.env.PERPLEXITY_API_KEY || null;
}

/** Liste les providers configurés (clé présente), dans l'ordre d'essai. */
function configuredProviders() {
  const list = [];
  if (getGeminiKey()) list.push('gemini');
  if (getOpenAIKey()) list.push('openai');
  if (getPerplexityKey()) list.push('perplexity');
  return list;
}

function hasAnyProvider() {
  return configuredProviders().length > 0;
}

function extractJson(text) {
  const cleaned = String(text || '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const sliced = cleaned.slice(start, end + 1);
      try {
        return JSON.parse(sliced);
      } catch (inner) {
        // On tente aussi un tableau JSON
        const as = cleaned.indexOf('[');
        const ae = cleaned.lastIndexOf(']');
        if (as !== -1 && ae > as) return JSON.parse(cleaned.slice(as, ae + 1));
        throw new Error('Réponse IA non parsable en JSON');
      }
    }
    throw new Error('Réponse IA non parsable en JSON');
  }
}

async function postJson(url, headers, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      data = { _raw: raw };
    }
    if (!res.ok) {
      const msg =
        data?.error?.message ||
        data?._raw?.slice(0, 200) ||
        `HTTP ${res.status}`;
      const err = new Error(`${res.status} — ${msg}`);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function geminiGenerate({ systemPrompt, userPrompt, temperature, maxTokens, json }) {
  const key = getGeminiKey();
  if (!key) throw new Error('GEMINI_API_KEY absente');

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    try {
      const body = {
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      };
      if (systemPrompt) {
        body.systemInstruction = { parts: [{ text: systemPrompt }] };
      }
      const data = await postJson(
        `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {},
        body,
        60000
      );
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p?.text || '').join('').trim();
      if (!text) {
        lastError = new Error(
          `Gemini (${model}) a renvoyé une réponse vide${data?.promptFeedback?.blockReason ? ' (' + data.promptFeedback.blockReason + ')' : ''}`
        );
        continue;
      }
      return text;
    } catch (err) {
      lastError = err;
      // Modèle inexistant / retiré → on essaie le suivant sans bruit.
      if (err.status === 404) continue;
      // 503 (surcharge) ou 429 (quota) → on essaie aussi le suivant.
      if (err.status === 503 || err.status === 429) continue;
      break;
    }
  }
  throw lastError || new Error('Gemini indisponible');
}

async function openaiGenerate({ systemPrompt, userPrompt, temperature, maxTokens, json }) {
  const key = getOpenAIKey();
  if (!key) throw new Error('OPENAI_API_KEY absente');

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const data = await postJson(
    OPENAI_URL,
    { Authorization: `Bearer ${key}` },
    {
      model: OPENAI_MODEL,
      temperature,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages,
    },
    60000
  );
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI a renvoyé une réponse vide');
  return text;
}

async function perplexityGenerate({ systemPrompt, userPrompt, temperature, maxTokens }) {
  const key = getPerplexityKey();
  if (!key) throw new Error('PERPLEXITY_API_KEY absente');

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const data = await postJson(
    PERPLEXITY_URL,
    { Authorization: `Bearer ${key}` },
    {
      model: process.env.PERPLEXITY_MODEL || 'sonar',
      temperature,
      max_tokens: maxTokens,
      messages,
    },
    60000
  );
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Perplexity a renvoyé une réponse vide');
  return text;
}

/**
 * Génère du texte via le premier provider disponible.
 * @returns {Promise<{text: string, provider: string}>}
 */
async function aiGenerate({
  systemPrompt = '',
  userPrompt,
  temperature = 1,
  maxTokens = 4000,
  json = false,
} = {}) {
  const attempts = [];
  const providers = configuredProviders();
  if (providers.length === 0) {
    throw new Error(
      'Aucune clé IA configurée (GEMINI_API_KEY, OPENAI_API_KEY ou PERPLEXITY_API_KEY)'
    );
  }

  for (const provider of providers) {
    try {
      if (provider === 'gemini') {
        const text = await geminiGenerate({ systemPrompt, userPrompt, temperature, maxTokens, json });
        return { text, provider: 'gemini' };
      }
      if (provider === 'openai') {
        const text = await openaiGenerate({ systemPrompt, userPrompt, temperature, maxTokens, json });
        return { text, provider: 'openai' };
      }
      if (provider === 'perplexity') {
        const text = await perplexityGenerate({ systemPrompt, userPrompt, temperature, maxTokens });
        return { text, provider: 'perplexity' };
      }
    } catch (err) {
      attempts.push(`${provider}: ${err.message}`);
      console.warn(`⚠️  IA ${provider} indisponible — ${err.message}`);
    }
  }

  throw new Error('Tous les providers IA ont échoué → ' + attempts.join(' | '));
}

/** Comme aiGenerate mais renvoie directement l'objet JSON parsé. */
async function aiGenerateJSON(options = {}) {
  const { text, provider } = await aiGenerate({ ...options, json: true });
  return { data: extractJson(text), provider };
}

module.exports = {
  aiGenerate,
  aiGenerateJSON,
  extractJson,
  configuredProviders,
  hasAnyProvider,
  getGeminiKey,
  getOpenAIKey,
  getPerplexityKey,
  GEMINI_MODELS,
};
