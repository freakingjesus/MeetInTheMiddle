import { describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

describe.sequential('POST /api/room error handling', () => {
  test('returns 500 when room select fails', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === 'rooms') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: { message: 'select fail' } }),
                }),
              }),
            };
          }
          if (table === 'status') {
            return {
              insert: async () => ({ error: { message: 'status fail' } }),
            };
          }
          throw new Error('unexpected table ' + table);
        },
      }),
    }));
    vi.doMock('@/lib/roomToken', () => ({ signRoomToken: vi.fn() }));

    const { POST } = await import('../app/api/room/route');
    const req = { json: async () => ({ code: 'abc', name: 'Alice' }) } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'select fail' });
  });

  test('returns 500 when room insert fails', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => {
      let roomsCall = 0;
      return {
        createAdminClient: () => ({
          from: (table: string) => {
            if (table === 'rooms') {
              if (roomsCall === 0) {
                roomsCall++;
                return {
                  select: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                };
              }
              return {
                insert: () => ({
                  select: () => ({
                    single: async () => ({ data: null, error: { message: 'insert fail' } }),
                  }),
                }),
              };
            }
            if (table === 'status') {
              return {
                insert: async () => ({ error: { message: 'should not call' } }),
              };
            }
            throw new Error('unexpected table ' + table);
          },
        }),
      };
    });
    vi.doMock('@/lib/roomToken', () => ({ signRoomToken: vi.fn() }));

    const { POST } = await import('../app/api/room/route');
    const req = { json: async () => ({ code: 'abc', name: 'Alice' }) } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'insert fail' });
  });

  test('returns 500 when status insert fails', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => {
      let roomsCall = 0;
      return {
        createAdminClient: () => ({
          from: (table: string) => {
            if (table === 'rooms') {
              if (roomsCall === 0) {
                roomsCall++;
                return {
                  select: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                };
              }
              return {
                insert: () => ({
                  select: () => ({
                    single: async () => ({ data: { id: '1' }, error: null }),
                  }),
                }),
              };
            }
            if (table === 'status') {
              return {
                insert: async () => ({ error: { message: 'status fail' } }),
              };
            }
            throw new Error('unexpected table ' + table);
          },
        }),
      };
    });
    vi.doMock('@/lib/roomToken', () => ({ signRoomToken: vi.fn() }));

    const { POST } = await import('../app/api/room/route');
    const req = { json: async () => ({ code: 'abc', name: 'Alice' }) } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'status fail' });
  });

  test('creates room when none exists', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => {
      let roomsCall = 0;
      return {
        createAdminClient: () => ({
          from: (table: string) => {
            if (table === 'rooms') {
              if (roomsCall === 0) {
                roomsCall++;
                return {
                  select: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                };
              }
              return {
                insert: () => ({
                  select: () => ({
                    single: async () => ({ data: { id: '1' }, error: null }),
                  }),
                }),
              };
            }
            if (table === 'status') {
              return {
                insert: async () => ({ error: null }),
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { your_name: null, their_name: null }, error: null }),
                  }),
                }),
                upsert: () => ({
                  select: () => ({
                    single: async () => ({ data: { your_name: 'Alice', their_name: null }, error: null }),
                  }),
                }),
              };
            }
            throw new Error('unexpected table ' + table);
          },
          channel: () => ({ send: vi.fn() }),
        }),
      };
    });
    const signRoomToken = vi.fn(() => 'token');
    vi.doMock('@/lib/roomToken', () => ({ signRoomToken }));

    const { POST } = await import('../app/api/room/route');
    const req = { json: async () => ({ code: 'abc', name: 'Alice' }) } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      side: 'your',
      your_name: 'Alice',
      their_name: null,
      roomToken: 'token',
    });
    expect(signRoomToken).toHaveBeenCalledWith('1', 'your', 'Alice');
  });

  test('creates room when select returns PGRST116', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => {
      let roomsCall = 0;
      return {
        createAdminClient: () => ({
          from: (table: string) => {
            if (table === 'rooms') {
              if (roomsCall === 0) {
                roomsCall++;
                return {
                  select: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: null,
                        error: { code: 'PGRST116', message: 'No rows found' },
                      }),
                    }),
                  }),
                };
              }
              return {
                insert: () => ({
                  select: () => ({
                    single: async () => ({ data: { id: '1' }, error: null }),
                  }),
                }),
              };
            }
            if (table === 'status') {
              return {
                insert: async () => ({ error: null }),
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { your_name: null, their_name: null }, error: null }),
                  }),
                }),
                upsert: () => ({
                  select: () => ({
                    single: async () => ({ data: { your_name: 'Alice', their_name: null }, error: null }),
                  }),
                }),
              };
            }
            throw new Error('unexpected table ' + table);
          },
          channel: () => ({ send: vi.fn() }),
        }),
      };
    });
    const signRoomToken = vi.fn(() => 'token');
    vi.doMock('@/lib/roomToken', () => ({ signRoomToken }));

    const { POST } = await import('../app/api/room/route');
    const req = { json: async () => ({ code: 'abc', name: 'Alice' }) } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      side: 'your',
      your_name: 'Alice',
      their_name: null,
      roomToken: 'token',
    });
    expect(signRoomToken).toHaveBeenCalledWith('1', 'your', 'Alice');
  });
});
