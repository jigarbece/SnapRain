-- =============================================
-- PartySnap - Supabase Schema
-- Run this in your Supabase SQL editor
-- =============================================

-- Events table
create table if not exists events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  code          text unique not null,
  organizer_name text not null,
  organizer_key  text not null,
  expires_at    timestamptz,
  created_at    timestamptz default now()
);

-- Participants table
create table if not exists participants (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid references events(id) on delete cascade,
  name       text not null,
  status     text not null default 'pending',  -- 'pending' | 'approved'
  joined_at  timestamptz default now()
);

-- Photos table
create table if not exists photos (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid references events(id) on delete cascade,
  participant_id   uuid references participants(id) on delete set null,
  participant_name text not null,
  storage_path     text not null,
  url              text not null,
  created_at       timestamptz default now()
);

-- Enable Row Level Security
alter table events       enable row level security;
alter table participants enable row level security;
alter table photos       enable row level security;

-- Public read/write policies (open for now — tighten per your needs)
create policy "public_read_events"   on events       for select using (true);
create policy "public_insert_events" on events       for insert with check (true);

create policy "public_read_participants"   on participants for select using (true);
create policy "public_insert_participants" on participants for insert with check (true);
create policy "public_update_participants" on participants for update using (true);
create policy "public_delete_participants" on participants for delete using (true);

create policy "public_read_photos"   on photos for select using (true);
create policy "public_insert_photos" on photos for insert with check (true);
create policy "public_delete_photos" on photos for delete using (true);

-- Enable Realtime on photos and participants
alter publication supabase_realtime add table photos;
alter publication supabase_realtime add table participants;

-- =============================================
-- Supabase Storage Setup (do this in the UI)
-- =============================================
-- 1. Go to Storage in your Supabase dashboard
-- 2. Create a new bucket named: photos
-- 3. Set it to PUBLIC
-- 4. Add this storage policy:
--
-- Policy name: public_upload_photos
-- Allowed operations: INSERT, SELECT
-- Policy definition: true
-- =============================================
