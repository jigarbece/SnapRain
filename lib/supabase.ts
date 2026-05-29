import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
