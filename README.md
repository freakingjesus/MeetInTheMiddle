# Meet in the Middle

A playful, neutral AI referee for couple discussions. Built with Next.js 14 App Router, Supabase, and Google Gemini.

## Features
- Join a room via 6-char code, no accounts required
- Each side submits their perspective and sees when the other is ready
- Generate a neutral summary with practical next steps using Gemini
- Optional thumbs up/down reactions
- Optional saving of summaries to history

## Getting Started

### 1. Install dependencies
```bash
pnpm install
```

### 2. Supabase setup
1. Create a project at [supabase.com](https://supabase.com) and note `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. In **Project Settings → API**, copy your project's **JWT secret** (use this for `ROOM_JWT_SECRET`) and generate a new **service role key**. Store the key safely and rotate if leaked (`SUPABASE_SERVICE_ROLE_KEY`).
3. In the SQL Editor run the schema below.
4. Enable Realtime for `status` and `entries` tables and create a broadcast channel named `room-{code}` for presence updates.

#### SQL schema & RLS
```sql
create extension if not exists "pgcrypto";

create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_at timestamptz default now()
);

create table entries (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  side text check (side in ('your','their')),
  content text,
  created_at timestamptz default now()
);

create table summaries (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  content text,
  helpful jsonb,
  created_at timestamptz default now()
);

create table status (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade unique,
  your_ready boolean default false,
  their_ready boolean default false,
  updated_at timestamptz default now()
);

alter table rooms enable row level security;
alter table entries enable row level security;
alter table summaries enable row level security;
alter table status enable row level security;

create policy "entries_room" on entries for all
using (room_id = auth.jwt() ->> 'room_id')
with check (room_id = auth.jwt() ->> 'room_id');

create policy "summaries_room" on summaries for all
using (room_id = auth.jwt() ->> 'room_id')
with check (room_id = auth.jwt() ->> 'room_id');

create policy "status_room" on status for all
using (room_id = auth.jwt() ->> 'room_id')
with check (room_id = auth.jwt() ->> 'room_id');
```

### 3. Google Gemini API key
Create an API key at [Google AI Studio](https://aistudio.google.com) and set `GOOGLE_API_KEY`.

### 4. Environment variables
Copy `.env.example` to `.env.local` and fill in your keys:
```
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role
GOOGLE_API_KEY=your-gemini-key
ROOM_JWT_SECRET=super-secret-string
```

The `ROOM_JWT_SECRET` must match the JWT secret shown in your Supabase project's API settings.

### 5. Run locally
```bash
pnpm dev
```
Open http://localhost:3000

### 6. (Optional) Deploy to Vercel
- Create a new project and import this repo
- Add the same env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `ROOM_JWT_SECRET`) in the Vercel dashboard
- Deploy

### Testing
```bash
pnpm test
```

### Creating a room
```bash
# in one terminal
pnpm dev
# open two browsers and navigate to http://localhost:3000
# enter the same room code on both and start chatting
```

## Directory structure
```
app/              # Next.js app router routes
app/api/*         # API routes for room, submit, generate, thumb, history
lib/              # Supabase, Gemini helpers
public/assets/    # placeholder icons (replace boxing.svg/hug.svg with real images as needed)
```

## License
MIT
