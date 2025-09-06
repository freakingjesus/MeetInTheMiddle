import { describe, expect, test } from 'vitest';
import { parseGeminiResponse } from '../lib/gemini';

describe('parseGeminiResponse', () => {
  test('parses valid JSON', () => {
    const json = '{"summary":"ok","nextSteps":["a"],"toneNotes":"note"}';
    expect(parseGeminiResponse(json)).toEqual({ summary: 'ok', nextSteps: ['a'], toneNotes: 'note' });
  });

  test('handles invalid JSON', () => {
    const res = parseGeminiResponse('not json');
    expect(res.summary).toBe('not json');
    expect(res.nextSteps).toEqual([]);
  });
});
