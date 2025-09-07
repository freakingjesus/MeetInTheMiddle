'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const enterRoom = async () => {
    setIsLoading(true);
    const roomCode = code || Math.random().toString(36).slice(2, 8);
    try {
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: roomCode, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to enter room');
        return;
      }
      localStorage.setItem(`room-token-${roomCode}`, data.roomToken);
      localStorage.setItem(`room-side-${roomCode}`, data.side);
      if (name) localStorage.setItem(`room-name-${roomCode}`, name);
      router.push(`/room/${roomCode}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-3xl font-bold">Meet in the Middle</h1>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="First name"
        className="border p-2 rounded w-48 text-center"
      />
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="6-char room code"
        className="border p-2 rounded w-48 text-center"
        maxLength={6}
      />
      <button
        onClick={enterRoom}
        disabled={isLoading || !name.trim()}
        className="bg-blue-500 text-white px-4 py-2 rounded transition-colors transition-transform hover:bg-blue-600 active:scale-95 disabled:opacity-50"
      >
        {isLoading
          ? code
            ? 'Joining room...'
            : 'Creating room...'
          : 'Create / Join'}
      </button>
    </main>
  );
}
