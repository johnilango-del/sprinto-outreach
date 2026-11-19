import { env, GEMINI_MODEL } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function stripFences(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json|JSON)?\s*/, '').replace(/\s*```\s*$/, '');
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first > 0 && last > first) t = t.slice(first, last + 1);
  return t.trim();
}

// Calls Gemini over REST. temperature 0.2, JSON output.
// Retries once on invalid JSON (and once on a temporary 429/5xx error).
export async function callGemini({ system, user, timeoutMs = 25000 }) {
  const key = env('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY is not set in Vercel.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  };

  let jsonRetried = false;
  let httpRetried = false;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining < 2000) throw new Error('Gemini did not answer in time.');
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(remaining),
      });
    } catch (e) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new Error('Gemini did not answer in time.');
      throw new Error(`Could not reach Gemini: ${e?.message || e}`);
    }
    if (!res.ok) {
      const errText = (await res.text().catch(() => '')).slice(0, 400);
      if ((res.status === 429 || res.status >= 500) && !httpRetried) {
        httpRetried = true;
        await sleep(1500);
        continue;
      }
      if (res.status === 404) throw new Error(`Gemini model "${GEMINI_MODEL}" was not found for this API key (HTTP 404). ${errText}`);
      if (res.status === 400 || res.status === 403) throw new Error(`Gemini rejected the request (HTTP ${res.status}). Check GEMINI_API_KEY. ${errText}`);
      throw new Error(`Gemini error HTTP ${res.status}: ${errText}`);
    }
    const data = await res.json();
    const cand = data?.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const text = parts
      .filter((p) => !p.thought)
      .map((p) => p.text || '')
      .join('');
    if (!text) {
      const why = cand?.finishReason || data?.promptFeedback?.blockReason || 'empty reply';
      if (!jsonRetried) {
        jsonRetried = true;
        continue;
      }
      throw new Error(`Gemini returned no text (${why}).`);
    }
    try {
      return JSON.parse(stripFences(text));
    } catch {
      if (!jsonRetried) {
        jsonRetried = true;
        continue;
      }
      throw new Error('Gemini returned invalid JSON twice.');
    }
  }
}
