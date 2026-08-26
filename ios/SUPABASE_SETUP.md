# CFB Prophet: Supabase & PostgreSQL Auth/Database Setup

This document provides the turnkey SQL schema and Row-Level Security (RLS) policies for CFB Prophet's cloud database.

---

## 1. PostgreSQL Database Schema

Run this SQL script in the **Supabase SQL Editor** to create the tables:

```sql
-- 1. PROFILES TABLE
create table public.profiles (
  id uuid references auth.users not null primary key,
  handle text unique not null,
  display_name text,
  favorite_team text default 'usc',
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone." on public.profiles
  for select using (true);

create policy "Users can insert their own profile." on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update their own profile." on public.profiles
  for update using (auth.uid() = id);

-- 2. CFP BRACKETS & SIMULATION PREDICTIONS
create table public.brackets (
  id text primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  creator text not null,
  notes text,
  champion jsonb not null,
  runner_up jsonb,
  seeds jsonb not null,
  playoff_summary jsonb,
  sim_state jsonb not null,
  mode text default 'custom',
  is_public boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.brackets enable row level security;

-- Policies:
-- Anyone can view public brackets
create policy "Public brackets are viewable by everyone." on public.brackets
  for select using (is_public = true or auth.uid() = user_id);

-- Only authenticated users can insert brackets linked to their account
create policy "Authenticated users can create brackets." on public.brackets
  for insert with check (auth.uid() = user_id);

-- Only the bracket OWNER can update their bracket
create policy "Users can update only their own brackets." on public.brackets
  for update using (auth.uid() = user_id);

-- Only the bracket OWNER can delete their bracket
create policy "Users can delete only their own brackets." on public.brackets
  for delete using (auth.uid() = user_id);
```

---

## 2. Apple Sign-In Configuration in Supabase

1. In the **Apple Developer Portal**:
   - Create a Services ID for Sign in with Apple (e.g. `com.cfbprophet.web.auth`).
   - Generate a private key (`.p8`) for Apple Sign-In.
2. In the **Supabase Dashboard**:
   - Go to **Authentication -> Providers -> Apple**.
   - Enable Apple and enter your **Services ID**, **Team ID**, **Key ID**, and `.p8` private key.
3. In the iOS App Xcode Project:
   - Target -> Signing & Capabilities -> **+ Capability -> Sign in with Apple**.

---

## 3. Client Environment Variables

In your frontend deployment:
```javascript
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```
