'use client';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import { GeminiSummary } from '@/lib/gemini';

export default function RoomPage({ params }: { params: { code: string } }) {
  const { code } = params;
  const [yourText, setYourText] = useState('');
  const [theirText, setTheirText] = useState('');
  const [yourReady, setYourReady] = useState(false);
  const [theirReady, setTheirReady] = useState(false);
  const [summary, setSummary] = useState<GeminiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem(`room-token-${code}`) : null;
    if (!token) return;
    const client = createBrowserClient(token);
    client
      .from('status')
      .select('your_ready, their_ready')
      .single()
      .then((res) => {
        if (res.data) {
          setYourReady(res.data.your_ready);
          setTheirReady(res.data.their_ready);
        }
      });
    const channel = client
      .channel(`room-${code}`)
      .on('broadcast', { event: 'READY_CHANGE' }, ({ payload }) => {
        if (payload.who === 'your') setYourReady(payload.ready);
        if (payload.who === 'their') setTheirReady(payload.ready);
      })
      .on('broadcast', { event: 'SUMMARY' }, ({ payload }) => {
        setSummary(payload as GeminiSummary);
        setYourReady(false);
        setTheirReady(false);
      })
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [code]);

  const submit = async (side: 'your' | 'their', content: string) => {
    const token = localStorage.getItem(`room-token-${code}`);
    await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomToken: token, side, content }),
    });
  };

  const generate = async () => {
    const token = localStorage.getItem(`room-token-${code}`);
    setError(null);
    setGenerating(true);
    setElapsed(0);
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomToken: token }),
      });
      if (!res.ok) {
        setError('Failed to generate summary');
        setSummary(null);
        return;
      }
      const data = await res.json();
      if (
        !data ||
        typeof data.summary !== 'string' ||
        typeof data.toneNotes !== 'string' ||
        (data.nextSteps && !Array.isArray(data.nextSteps))
      ) {
        setError('Failed to generate summary');
        setSummary(null);
        return;
      }
      setSummary(data);
      setYourReady(false);
      setTheirReady(false);
    } catch {
      setError('Failed to generate summary');
      setSummary(null);
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
  };

  return (
    <main className="min-h-screen p-4 flex flex-col items-center gap-4">
      <h2 className="text-2xl font-semibold">Room {code}</h2>
      <div className="flex gap-4 w-full max-w-4xl">
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <img src="/assets/boxing.svg" alt="boxing" className="w-6 h-6" />
            <span>Your Side</span>
            <span className={`text-sm px-2 rounded ${yourReady ? 'bg-green-200' : 'bg-gray-200'}`}>
              {yourReady ? 'Ready' : 'Waiting'}
            </span>
          </div>
          <textarea
            className="border p-2 rounded"
            value={yourText}
            onChange={(e) => setYourText(e.target.value)}
            disabled={yourReady}
          />
          <button
            className="bg-blue-500 text-white px-2 py-1 rounded self-start cursor-pointer transition-all hover:bg-blue-600 active:bg-blue-700 active:scale-95 disabled:opacity-50"
            onClick={() => submit('your', yourText)}
            disabled={yourReady}
          >
            Submit
          </button>
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <img src="/assets/boxing.svg" alt="boxing" className="w-6 h-6" />
            <span>Their Side</span>
            <span className={`text-sm px-2 rounded ${theirReady ? 'bg-green-200' : 'bg-gray-200'}`}>
              {theirReady ? 'Ready' : 'Waiting'}
            </span>
          </div>
          <textarea
            className="border p-2 rounded"
            value={theirText}
            onChange={(e) => setTheirText(e.target.value)}
            disabled={theirReady}
          />
          <button
            className="bg-blue-500 text-white px-2 py-1 rounded self-start cursor-pointer transition-all hover:bg-blue-600 active:bg-blue-700 active:scale-95 disabled:opacity-50"
            onClick={() => submit('their', theirText)}
            disabled={theirReady}
          >
            Submit
          </button>
        </div>
      </div>
      {yourReady && theirReady && (
        <button
          onClick={generate}
          className="bg-purple-500 text-white px-4 py-2 rounded cursor-pointer transition-all hover:bg-purple-600 active:bg-purple-700 active:scale-95 disabled:opacity-50"
          disabled={generating}
        >
          {generating ? `Calling Gemini... ${elapsed}s` : 'Generate Neutral Summary'}
        </button>
      )}
      {error && <p className="text-red-500">{error}</p>}
      {summary && (
        <div className="border p-4 rounded w-full max-w-2xl flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <img src="/assets/hug.svg" alt="hug" className="w-6 h-6" />
            <h3 className="font-semibold">Summary</h3>
          </div>
          <p>{summary.summary}</p>
          {summary.nextSteps && (
            <ul className="list-disc pl-5">
              {summary.nextSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-gray-500">{summary.toneNotes}</p>
        </div>
      )}
    </main>
  );
}
