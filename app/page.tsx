'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { generateCode, saveParticipant, saveOrganizerKey } from '@/lib/utils'

export default function HomePage() {
  const router = useRouter()
  const [tab, setTab] = useState<'create' | 'join'>('create')

  const [eventTitle, setEventTitle] = useState('')
  const [organizerName, setOrganizerName] = useState('')
  const [expiryHours, setExpiryHours] = useState('24')
  const [creating, setCreating] = useState(false)

  const [joinCode, setJoinCode] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!eventTitle.trim() || !organizerName.trim()) return
    setCreating(true)
    setError('')
    try {
      const code = generateCode()
      const organizerKey = generateCode(12)
      const expiresAt = expiryHours !== 'never'
        ? new Date(Date.now() + parseInt(expiryHours) * 3600 * 1000).toISOString()
        : null

      const { data: event, error: eventErr } = await supabase
        .from('events')
        .insert({ title: eventTitle.trim(), code, organizer_name: organizerName.trim(), organizer_key: organizerKey, expires_at: expiresAt })
        .select()
        .single()

      if (eventErr) throw eventErr

      const { data: participant, error: partErr } = await supabase
        .from('participants')
        .insert({ event_id: event.id, name: organizerName.trim() })
        .select()
        .single()

      if (partErr) throw partErr

      saveParticipant(code, { id: participant.id, name: organizerName.trim() })
      saveOrganizerKey(code, organizerKey)
      router.push(`/event/${code}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code || !joinName.trim()) return
    setJoining(true)
    setError('')
    try {
      const { data: event, error: eventErr } = await supabase
        .from('events')
        .select()
        .eq('code', code)
        .single()

      if (eventErr || !event) throw new Error('Event not found. Check the code.')
      if (event.expires_at && new Date(event.expires_at) < new Date()) {
        throw new Error('This event has expired.')
      }

      const { data: participant, error: partErr } = await supabase
        .from('participants')
        .insert({ event_id: event.id, name: joinName.trim() })
        .select()
        .single()

      if (partErr) throw partErr

      saveParticipant(code, { id: participant.id, name: joinName.trim() })
      router.push(`/event/${code}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">🌧️</div>
        <h1 className="text-3xl font-bold text-white">SnapRain</h1>
        <p className="text-zinc-400 mt-2 text-sm">Photos rain down to everyone, instantly</p>
      </div>

      <div className="w-full max-w-sm bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800">
        <div className="flex">
          <button
            onClick={() => { setTab('create'); setError('') }}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'create' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
          >
            Create Event
          </button>
          <button
            onClick={() => { setTab('join'); setError('') }}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'join' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
          >
            Join Event
          </button>
        </div>

        <div className="p-5">
          {tab === 'create' ? (
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Event Name</label>
                <input
                  className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-white/20 placeholder-zinc-500"
                  placeholder="John's Birthday Party"
                  value={eventTitle}
                  onChange={e => setEventTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Your Name</label>
                <input
                  className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-white/20 placeholder-zinc-500"
                  placeholder="Alex"
                  value={organizerName}
                  onChange={e => setOrganizerName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Event Expires</label>
                <select
                  className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-white/20"
                  value={expiryHours}
                  onChange={e => setExpiryHours(e.target.value)}
                >
                  <option value="6">In 6 hours</option>
                  <option value="24">In 24 hours</option>
                  <option value="48">In 2 days</option>
                  <option value="168">In 7 days</option>
                  <option value="never">Never</option>
                </select>
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                type="submit"
                disabled={creating}
                className="w-full bg-white text-black font-semibold rounded-xl py-3 text-sm hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating...' : 'Create Event ✨'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Event Code</label>
                <input
                  className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-white/20 placeholder-zinc-500 uppercase tracking-widest text-center font-mono text-xl"
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  maxLength={6}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Your Name</label>
                <input
                  className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-white/20 placeholder-zinc-500"
                  placeholder="Sarah"
                  value={joinName}
                  onChange={e => setJoinName(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                type="submit"
                disabled={joining}
                className="w-full bg-white text-black font-semibold rounded-xl py-3 text-sm hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                {joining ? 'Joining...' : 'Join Event 🎉'}
              </button>
            </form>
          )}
        </div>
      </div>

      <p className="text-zinc-600 text-xs mt-6 text-center max-w-xs">
        No account needed · Photos rain to everyone · Auto-save to your gallery
      </p>
    </div>
  )
}
