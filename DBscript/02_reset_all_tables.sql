-- ============================================================================
-- SnapRain — RESET all event data  ⚠️ DESTRUCTIVE / IRREVERSIBLE
-- Deletes ALL rows from events, participants and photos.
-- Run in: Supabase dashboard → SQL Editor (only when you want a clean slate).
-- ============================================================================

truncate table public.photos, public.participants, public.events restart identity cascade;

-- NOTE — this does NOT remove:
--   • Photo image files in Storage  → dashboard: Storage → "photos" bucket → delete
--   • Organizer accounts            → dashboard: Authentication → Users → delete
--
-- The site_stats visit counter is intentionally NOT wiped here.
-- To also zero the visit count, uncomment:
-- update public.site_stats set visits = 0 where id = 1;
