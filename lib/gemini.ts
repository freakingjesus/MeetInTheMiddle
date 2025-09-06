import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

const schema = z.object({
  summary: z.string(),
  nextSteps: z.array(z.string()),
  toneNotes: z.string(),
});

export type GeminiSummary = z.infer<typeof schema>;

export async function callGemini(your: string, their: string): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return JSON.stringify({
      summary: `Your Side: ${your}\nTheir Side: ${their}`,
      nextSteps: [],
      toneNotes: '',
    });
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
  const system =
    'You are a neutral mediator. Summarize both sides fairly. Use validating, non-judgmental language. Offer 2–3 practical next steps phrased as “We can…” and acknowledge feelings. Avoid taking sides; avoid blame.';
  const user = `Your Side:\n${your}\n\nTheir Side:\n${their}`;
  const result = await model.generateContent({
    contents: [
      { role: 'system', parts: [{ text: system }] },
      { role: 'user', parts: [{ text: user }] },
    ],
    generationConfig: { responseMimeType: 'application/json' },
  });
  const text = result.response.text();
  return text;
}

export function parseGeminiResponse(text: string): GeminiSummary {
  try {
    const data = JSON.parse(text);
    return schema.parse(data);
  } catch {
    return { summary: text, nextSteps: [], toneNotes: '' };
  }
}
