-- ============================================================================
-- SnapRain — Site Stats (visit counter) setup
-- Run ONCE in: Supabase dashboard → SQL Editor → New query → Run
-- Powers the "Visits" number in the homepage stats bar (components/SiteStats.tsx).
-- ============================================================================

-- Global stats: single-row visit counter
create table if not exists public.site_stats (
  id int primary key default 1,
  visits bigint not null default 0,
  constraint single_row check (id = 1)
);

insert into public.site_stats (id, visits) values (1, 0)
  on conflict (id) do nothing;

-- Let anyone read the count
alter table public.site_stats enable row level security;
drop policy if exists "site_stats read" on public.site_stats;
create policy "site_stats read" on public.site_stats for select using (true);

-- Atomic, safe increment (security definer so the public anon key can call it)
create or replace function public.increment_site_visits()
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.site_stats set visits = visits + 1 where id = 1
  returning visits;
$$;

grant execute on function public.increment_site_visits() to anon, authenticated;

-- Optional: reset the visit count back to zero
-- update public.site_stats set visits = 0 where id = 1;
