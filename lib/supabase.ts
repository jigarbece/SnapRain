import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    _client = createClient(url, key)
  }
  return _client
}

// Convenience proxy — lazily initialized so module import doesn't throw during build
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as never)[prop]
  },
})

export type Event = {
  id: string
  title: string
  code: string
  organizer_name: string
  organizer_key: string
  expires_at: string | null
  created_at: string
}

export type Participant = {
  id: string
  event_id: string
  name: string
  joined_at: string
}

export type Photo = {
  id: string
  event_id: string
  participant_id: string
  participant_name: string
  storage_path: string
  url: string
  created_at: string
}
