'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, Participant } from '@/lib/supabase'
import { saveParticipant, getParticipant, clearParticipant } from '@/lib/utils'

export default function JoinPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [pendingParticipantId, setPendingParticipantId] = useState<string | null>(null)

  useEffect(() => {
    const existing = getParticipant(code)
    if (existing) { router.push(`/event/${code}`); return }

    supabase.from('events').select('title').eq('code', code).single().then(({ data }) => {
      if (data) setEventTitle(data.title)
      else setError('Event not found.')
    })
  }, [code, router])

  // Watch for approval once in waiting state
  useEffect(() => {
    if (!pendingParticipantId) return
    const channel = supabase
      .channel(`approval_${pendingParticipantId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'participants', filter: `id=eq.${pendingParticipantId}` },
        (payload) => {
          const updated = payload.new as Participant
          if (updated.status === 'approved') {
            supabase.removeChannel(channel)
            router.push(`/event/${code}`)
          }
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'participants', filter: `id=eq.${pendingParticipantId}` },
        () => {
          supabase.removeChannel(channel)
          clearParticipant(code)          // ← clear localStorage so no redirect loop
          setWaiting(false)
          setPendingParticipantId(null)
          setJoining(false)
          setError('Your request was declined. Please try again.')
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [pendingParticipantId, code, router])

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
        .from('participants').insert({ event_id: event.id, name: name.trim(), status: 'pending' }).select().single()
      if (partErr) throw partErr

      saveParticipant(code, { id: participant.id, name: name.trim() })
      setPendingParticipantId(participant.id)
      setWaiting(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setJoining(false)
    }
  }

  if (error === 'Event not found.') return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">😕</div>
        <p className="text-slate-900 font-semibold text-lg">Event not found</p>
        <p className="text-slate-500 text-sm mt-1">The link may have expired</p>
        <button onClick={() => router.push('/')} className="mt-6 bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold text-sm shadow-md shadow-indigo-200">Go Home</button>
      </div>
    </div>
  )

  if (waiting) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex flex-col items-center justify-center px-4 text-center relative">
      <div className="flex items-center gap-2 mb-8">
        <img src="/logo.png" alt="SnapRain" className="w-6 h-6 object-contain" />
        <span className="text-indigo-600 font-bold tracking-wide">snap<span className="text-slate-800">Rain</span></span>
      </div>
      <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 animate-pulse">⏳</div>
      <h2 className="text-slate-900 text-xl font-bold mb-2">Waiting for approval</h2>
      <p className="text-slate-500 text-sm mb-1">The organizer needs to approve your request</p>
      <p className="text-slate-400 text-xs mb-8">You&apos;ll be let in automatically once approved</p>
      <div className="bg-white rounded-2xl px-6 py-4 border border-slate-200 shadow-sm">
        <p className="text-slate-400 text-xs mb-1">Joining as</p>
        <p className="text-slate-900 font-semibold">{name}</p>
        {eventTitle && <p className="text-indigo-500 text-xs mt-1 font-medium">{eventTitle}</p>}
      </div>
      <button
        onClick={() => { clearParticipant(code); setWaiting(false); setJoining(false); setPendingParticipantId(null) }}
        className="mt-8 text-slate-400 text-xs underline"
      >
        Cancel
      </button>
      <p className="absolute bottom-4 text-slate-300 text-[10px]">Designed and Conceptualized by Jigar Pandya</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex flex-col items-center justify-center px-4 relative">
      <div className="flex items-center gap-2 mb-8">
        <img src="/logo.png" alt="SnapRain" className="w-7 h-7 object-contain" />
        <span className="text-indigo-600 font-bold text-lg tracking-wide">snap<span className="text-slate-800">Rain</span></span>
      </div>
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-indigo-200">🎉</div>
        <h1 className="text-2xl font-bold text-slate-900">You&apos;re invited!</h1>
        {eventTitle && <p className="text-indigo-600 mt-1.5 font-semibold">{eventTitle}</p>}
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl p-6 border border-slate-200 shadow-xl shadow-slate-100">
        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1.5">Enter your name to join</label>
            <input
              className="w-full bg-slate-50 text-slate-900 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 transition"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={joining}
            className="w-full bg-indigo-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md shadow-indigo-200"
          >
            {joining ? 'Sending request...' : 'Request to Join 📸'}
          </button>
        </form>
      </div>

      <p className="text-slate-400 text-xs mt-4">Code: <span className="font-mono font-bold text-slate-600">{code}</span></p>
      <p className="absolute bottom-4 text-slate-300 text-[10px]">Designed and Conceptualized by Jigar Pandya</p>
    </div>
  )
}
