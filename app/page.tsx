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
        .select().single()
      if (eventErr) throw eventErr

      const { data: participant, error: partErr } = await supabase
        .from('participants')
        .insert({ event_id: event.id, name: organizerName.trim(), status: 'approved' })
        .select().single()
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

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    router.push(`/join/${code}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="text-center mb-8">
        <img src="/logo.png" alt="SnapRain" className="w-24 h-24 mx-auto mb-3 rounded-3xl shadow-xl shadow-indigo-200" />
        <h1 className="text-3xl font-bold text-slate-900">snap<span className="text-blue-500">Rain</span></h1>
        <p className="text-slate-500 mt-1.5 text-sm font-medium">Every shot, shared with everyone — instantly 🌧️</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-xl shadow-slate-100">
        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => { setTab('create'); setError('') }}
            className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${tab === 'create' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Create Event
          </button>
          <button
            onClick={() => { setTab('join'); setError('') }}
            className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${tab === 'join' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Join Event
          </button>
        </div>

        <div className="p-5">
          {tab === 'create' ? (
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">Event Name</label>
                <input
                  className="w-full bg-slate-50 text-slate-900 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 transition"
                  placeholder="John's Birthday Party"
                  value={eventTitle}
                  onChange={e => setEventTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">Your Name</label>
                <input
                  className="w-full bg-slate-50 text-slate-900 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 transition"
                  placeholder="Alex"
                  value={organizerName}
                  onChange={e => setOrganizerName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">Event Expires</label>
                <select
                  className="w-full bg-slate-50 text-slate-900 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
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
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <button
                type="submit"
                disabled={creating}
                className="w-full bg-indigo-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md shadow-indigo-200"
              >
                {creating ? 'Creating...' : 'Create Event ✨'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">Event Code</label>
                <input
                  className="w-full bg-slate-50 text-slate-900 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 uppercase tracking-widest text-center font-mono text-xl transition"
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  maxLength={6}
                  required
                />
              </div>
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <button
                type="submit"
                className="w-full bg-indigo-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200"
              >
                Continue to Join 🎉
              </button>
            </form>
          )}
        </div>
      </div>

      <p className="text-slate-400 text-xs mt-6 text-center max-w-xs">
        No account needed · Photos shared instantly · Auto-save to your gallery
      </p>
    </div>
  )
}
