import { describe, expect, test, vi } from 'vitest';
import type { NextRequest } from 'next/server';

type EntryRow = {
  side: 'your' | 'their';
  content: string;
  created_at: string;
};

type SummaryRow = {
  content: string;
  created_at: string;
};

function setupSupabaseMock({
  entriesData,
  previousSummaryRows = [],
  status = { your_name: 'Alice', their_name: 'Bob' },
}: {
  entriesData: EntryRow[];
  previousSummaryRows?: SummaryRow[];
  status?: { your_name: string; their_name: string };
}) {
  let currentEntries = [...entriesData];
  const entriesOrderMock = vi.fn().mockImplementation(() =>
    Promise.resolve({ data: currentEntries, error: null })
  );
  const entriesBuilder: any = {};
  entriesBuilder.select = vi.fn(() => entriesBuilder);
  entriesBuilder.eq = vi.fn(() => entriesBuilder);
  entriesBuilder.gt = vi.fn((column: string, value: string) => {
    currentEntries = currentEntries.filter((entry) => {
      const entryValue = (entry as Record<string, string>)[column];
      return entryValue > value;
    });
    return entriesBuilder;
  });
  entriesBuilder.order = entriesOrderMock;

  const summaryOrderMock = vi.fn().mockResolvedValue({
    data: previousSummaryRows,
    error: null,
  });
  const summariesTable = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: summaryOrderMock,
      })),
    })),
    insert: vi.fn(async () => ({ error: null })),
  };

  const statusTable = {
    select: () => ({
      eq: () => ({
        single: async () => ({ data: status, error: null }),
      }),
    }),
  };

  const roomsTable = {
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { code: 'abc' } }),
      }),
    }),
  };

  const adminClient = {
    from: (table: string) => {
      if (table === 'entries') {
        return entriesBuilder;
      }
      if (table === 'summaries') {
        return summariesTable;
      }
      if (table === 'status') {
        return statusTable;
      }
      if (table === 'rooms') {
        return roomsTable;
      }
      throw new Error('unexpected table ' + table);
    },
    channel: () => ({ send: vi.fn() }),
  };

  return {
    adminClient,
    entriesBuilder,
    entriesOrderMock,
    summariesTable,
  };
}

describe('POST /api/generate', () => {
  test('returns summary when GOOGLE_API_KEY is missing', async () => {
    vi.resetModules();
    delete process.env.GOOGLE_API_KEY;
    const supabase = setupSupabaseMock({
      entriesData: [
        { side: 'your', content: 'your perspective', created_at: '2024-01-01T00:00:00Z' },
        { side: 'their', content: 'their perspective', created_at: '2024-01-01T00:01:00Z' },
      ],
    });

    vi.doMock('@/lib/supabase', () => ({
      createAdminClient: () => supabase.adminClient,
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

  test('concatenates entries per side when generating the summary', async () => {
    vi.resetModules();
    process.env.GOOGLE_API_KEY = 'fake-key';

    const supabase = setupSupabaseMock({
      entriesData: [
        { side: 'your', content: 'first from you', created_at: '2024-01-01T00:00:00Z' },
        { side: 'their', content: 'first from them', created_at: '2024-01-01T00:01:00Z' },
        { side: 'your', content: 'second from you', created_at: '2024-01-01T00:02:00Z' },
        { side: 'their', content: 'second from them', created_at: '2024-01-01T00:03:00Z' },
      ],
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
      createAdminClient: () => supabase.adminClient,
    }));

    vi.doMock('@/lib/roomToken', () => ({ verifyRoomToken: () => 'room1' }));

    const { POST } = await import('../app/api/generate/route');
    const req = {
      json: async () => ({ roomToken: 't' }),
    } as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(supabase.entriesOrderMock).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(callGemini).toHaveBeenCalledWith(
      'first from you\n\nsecond from you',
      'first from them\n\nsecond from them',
      'Alice',
      'Bob',
      undefined
    );
    expect(parseGeminiResponse).toHaveBeenCalledWith('gemini response');

    const data = await res.json();
    expect(data).toEqual({ summary: 'parsed summary', nextSteps: ['step'], toneNotes: 'tone' });
  });

  test('passes the prior summary to Gemini when new entries are present', async () => {
    vi.resetModules();
    process.env.GOOGLE_API_KEY = 'fake-key';

    const storedSummary = {
      summary: 'We agreed to keep things calm and focus on listening.',
      nextSteps: ['Schedule a weekly check-in'],
      toneNotes: 'Respectful and warm tone',
    };
    const storedSummaryRow = {
      content: JSON.stringify(storedSummary),
      created_at: '2024-01-01T01:00:00Z',
    };

    const supabase = setupSupabaseMock({
      entriesData: [
        { side: 'your', content: 'earlier from you', created_at: '2024-01-01T00:30:00Z' },
        { side: 'their', content: 'earlier from them', created_at: '2024-01-01T00:45:00Z' },
        { side: 'your', content: 'update from you', created_at: '2024-01-01T01:05:00Z' },
        { side: 'their', content: 'update from them', created_at: '2024-01-01T01:06:00Z' },
      ],
      previousSummaryRows: [storedSummaryRow],
    });

    const finalSummary = {
      summary: 'parsed summary',
      nextSteps: ['step'],
      toneNotes: 'tone',
    };

    const callGemini = vi.fn().mockResolvedValue('gemini response');
    const parseGeminiResponse = vi
      .fn()
      .mockImplementationOnce(() => storedSummary)
      .mockImplementationOnce(() => finalSummary);

    vi.doMock('@/lib/gemini', () => ({
      callGemini,
      parseGeminiResponse,
    }));

    vi.doMock('@/lib/supabase', () => ({
      createAdminClient: () => supabase.adminClient,
    }));

    vi.doMock('@/lib/roomToken', () => ({ verifyRoomToken: () => 'room1' }));

    const { POST } = await import('../app/api/generate/route');
    const req = {
      json: async () => ({ roomToken: 't' }),
    } as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(parseGeminiResponse).toHaveBeenNthCalledWith(1, storedSummaryRow.content);
    expect(supabase.entriesBuilder.gt).toHaveBeenCalledWith('created_at', storedSummaryRow.created_at);
    expect(callGemini).toHaveBeenCalledWith(
      'update from you',
      'update from them',
      'Alice',
      'Bob',
      storedSummary
    );
    expect(parseGeminiResponse).toHaveBeenLastCalledWith('gemini response');

    const data = await res.json();
    expect(data).toEqual(finalSummary);
  });
});

