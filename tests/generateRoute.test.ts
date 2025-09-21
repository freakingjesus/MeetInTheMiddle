import { describe, expect, test, vi } from 'vitest';
import type { NextRequest } from 'next/server';

describe('POST /api/generate', () => {
  test('returns summary when GOOGLE_API_KEY is missing', async () => {
    vi.resetModules();
    delete process.env.GOOGLE_API_KEY;
    vi.doMock('@/lib/supabase', () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === 'entries') {
            return {
              select: () => ({
                eq: () => ({
                  order: async () => ({
                    data: [
                      { side: 'your', content: 'your perspective' },
                      { side: 'their', content: 'their perspective' },
                    ],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'rooms') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { code: 'abc' } }),
                }),
              }),
            };
          }
          if (table === 'status') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { your_name: 'Alice', their_name: 'Bob' }, error: null }),
                }),
              }),
            };
          }
          if (table === 'summaries') {
            return {
              insert: async () => ({ error: null }),
            };
          }
          throw new Error('unexpected table ' + table);
        },
        channel: () => ({ send: vi.fn() }),
      }),
    }));
    vi.doMock('@/lib/roomToken', () => ({ verifyRoomToken: () => 'room1' }));

    const { POST } = await import('../app/api/generate/route');
    const req = {
      json: async () => ({ roomToken: 't' }),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toBe('Missing Google API key');
    expect(data.nextSteps).toEqual([]);
  });

  test('uses the newest entries per side when generating the summary', async () => {
    vi.resetModules();
    process.env.GOOGLE_API_KEY = 'fake-key';

    const orderMock = vi.fn().mockResolvedValue({
      data: [
        { side: 'your', content: 'latest from you' },
        { side: 'your', content: 'older from you' },
        { side: 'their', content: 'latest from them' },
        { side: 'their', content: 'older from them' },
      ],
      error: null,
    });

    const callGemini = vi.fn().mockResolvedValue('gemini response');
    const parseGeminiResponse = vi.fn().mockReturnValue({
      summary: 'parsed summary',
      nextSteps: ['step'],
      toneNotes: 'tone',
    });

    vi.doMock('@/lib/gemini', () => ({
      callGemini,
      parseGeminiResponse,
    }));

    vi.doMock('@/lib/supabase', () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === 'entries') {
            return {
              select: () => ({
                eq: () => ({
                  order: orderMock,
                }),
              }),
            };
          }
          if (table === 'rooms') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { code: 'abc' } }),
                }),
              }),
            };
          }
          if (table === 'status') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { your_name: 'Alice', their_name: 'Bob' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'summaries') {
            return {
              insert: async () => ({ error: null }),
            };
          }
          throw new Error('unexpected table ' + table);
        },
        channel: () => ({ send: vi.fn() }),
      }),
    }));

    vi.doMock('@/lib/roomToken', () => ({ verifyRoomToken: () => 'room1' }));

    const { POST } = await import('../app/api/generate/route');
    const req = {
      json: async () => ({ roomToken: 't' }),
    } as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(callGemini).toHaveBeenCalledWith(
      'latest from you',
      'latest from them',
      'Alice',
      'Bob'
    );
    expect(parseGeminiResponse).toHaveBeenCalledWith('gemini response');

    const data = await res.json();
    expect(data).toEqual({ summary: 'parsed summary', nextSteps: ['step'], toneNotes: 'tone' });
  });
});

