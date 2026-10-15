import { env } from '../config/env.js';

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 2;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

async function requestOnce(url: string, apiKey: string, body: unknown): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[gemini] request failed with status ${response.status}`);
      return null;
    }

    const data = (await response.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? '').join('').trim();
    return text || null;
  } catch {
    console.warn('[gemini] request failed or timed out');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Sends one audio clip and a prompt. Returns the parsed JSON, or null on ANY failure.
// It never throws, so the endpoint never fails because of the AI.
export async function askGeminiWithAudio(input: {
  audio: Buffer;
  mimeType: string;
  prompt: string;
}): Promise<unknown> {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL;
  if (!apiKey || !model) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: input.mimeType, data: input.audio.toString('base64') } },
          { text: input.prompt },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json' },
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const text = await requestOnce(url, apiKey, body);
    if (!text) continue;
    try {
      return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      // invalid JSON, try once more
    }
  }
  return null;
}