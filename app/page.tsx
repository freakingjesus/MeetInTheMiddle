'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [code, setCode] = useState('');
  const router = useRouter();

  const enterRoom = async () => {
    const roomCode = code || Math.random().toString(36).slice(2, 8);
    const res = await fetch('/api/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: roomCode }),
    });
    const data = await res.json();
    localStorage.setItem(`room-token-${roomCode}`, data.roomToken);
    router.push(`/room/${roomCode}`);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-3xl font-bold">Meet in the Middle</h1>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="6-char room code"
        className="border p-2 rounded w-48 text-center"
        maxLength={6}
      />
      <button
        onClick={enterRoom}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Create / Join
      </button>
    </main>
  );
}
