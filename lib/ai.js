// Calls Gemini (Google AI Studio API) over plain fetch, no package. Env: GEMINI_API_KEY (server only), optional GEMINI_MODEL.
// geminiJSON returns the model's answer parsed from JSON, shaped by a response schema.

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

async function geminiJSON({ system, prompt, schema, maxTokens = 800 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('GEMINI_API_KEY is not set'), { status: 503 });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: maxTokens, temperature: 0.4 }
    }),
    signal: AbortSignal.timeout(20000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}: ${(data.error && data.error.message) || 'request failed'}`), { status: 502 });
  const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
    ? data.candidates[0].content.parts.map(p => p.text || '').join('') : '';
  if (!text) throw Object.assign(new Error('Gemini returned no text'), { status: 502 });
  return { json: JSON.parse(text), model: MODEL(), usage: data.usageMetadata || null };
}

module.exports = { geminiJSON, MODEL };
