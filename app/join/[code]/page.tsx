'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { saveParticipant, getParticipant } from '@/lib/utils'

export default function JoinPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [eventTitle, setEventTitle] = useState('')

  useEffect(() => {
    // If already joined, go straight in
    const existing = getParticipant(code)
    if (existing) { router.push(`/event/${code}`); return }

    // Fetch event title for display
    supabase.from('events').select('title').eq('code', code).single().then(({ data }) => {
      if (data) setEventTitle(data.title)
      else setError('Event not found.')
    })
  }, [code, router])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setJoining(true)
    setError('')
    try {
      const { data: event } = await supabase.from('events').select().eq('code', code).single()
      if (!event) throw new Error('Event not found.')
      if (event.expires_at && new Date(event.expires_at) < new Date()) throw new Error('This event has expired.')

      const { data: participant, error: partErr } = await supabase
        .from('participants').insert({ event_id: event.id, name: name.trim() }).select().single()
      if (partErr) throw partErr

      saveParticipant(code, { id: participant.id, name: name.trim() })
      router.push(`/event/${code}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setJoining(false)
    }
  }

  if (error === 'Event not found.') return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-4xl mb-4">😕</div>
        <p className="text-white font-semibold">Event not found</p>
        <p className="text-zinc-500 text-sm mt-1">The link may have expired</p>
        <button onClick={() => router.push('/')} className="mt-6 bg-white text-black px-6 py-3 rounded-xl font-semibold text-sm">Go Home</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">🎉</div>
        <h1 className="text-2xl font-bold text-white">You&apos;re invited!</h1>
        {eventTitle && <p className="text-zinc-300 mt-2 font-medium">{eventTitle}</p>}
      </div>

      <div className="w-full max-w-sm bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Enter your name to join</label>
            <input
              className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-white/20 placeholder-zinc-500"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={joining}
            className="w-full bg-white text-black font-semibold rounded-xl py-3 text-sm hover:bg-zinc-200 disabled:opacity-50 transition-colors"
          >
            {joining ? 'Joining...' : 'Join & Start Snapping 📸'}
          </button>
        </form>
      </div>

      <p className="text-zinc-600 text-xs mt-4">Code: <span className="font-mono font-bold text-zinc-400">{code}</span></p>
    </div>
  )
}
