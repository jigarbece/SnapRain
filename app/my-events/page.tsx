'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Event } from '@/lib/supabase'
import { saveOrganizerKey, saveParticipant } from '@/lib/utils'

type Step = 'email' | 'otp' | 'events'

export default function MyEventsPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [events, setEvents] = useState<Event[]>([])
  const [openingCode, setOpeningCode] = useState('')

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setStep('otp')
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otp.trim(),
      type: 'email',
    })
    if (error) { setError('Invalid code. Please try again.'); setLoading(false); return }

    // Fetch all events linked to this organizer account
    const { data: evs } = await supabase
      .from('events')
      .select()
      .eq('organizer_user_id', data.user?.id)
      .order('created_at', { ascending: false })

    setLoading(false)
    setEvents(evs || [])
    setStep('events')
  }

  async function handleOpenEvent(ev: Event) {
    setOpeningCode(ev.code)
    // Save organizer_key so the organizer page works on this device
    saveOrganizerKey(ev.code, ev.organizer_key)

    // Also fetch and save participant data so event page works too
    const { data: part } = await supabase
      .from('participants')
      .select()
      .eq('event_id', ev.id)
      .eq('name', ev.organizer_name)
      .eq('status', 'approved')
      .maybeSingle()

    if (part) saveParticipant(ev.code, { id: part.id, name: part.name })

    router.push(`/organizer/${ev.code}`)
  }

  const brandBar = (
    <div className="flex items-center justify-center gap-2 mb-8">
      <img src="/logo.png" alt="SnapRain" className="w-8 h-8 rounded-xl object-cover shadow-md shadow-indigo-200" />
      <span className="text-indigo-600 text-lg font-black tracking-wide">snap<span className="text-slate-800">Rain</span></span>
    </div>
  )

  // ── Step 1: Enter email ─────────────────────────────────────────────────────
  if (step === 'email') return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-blue-50 flex flex-col items-center justify-center px-4 pb-16">
      {brandBar}

      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-sm">📬</div>
        <h1 className="text-2xl font-bold text-slate-900">My Past Events</h1>
        <p className="text-slate-500 text-sm mt-1.5 max-w-xs">Enter the email you used when creating your events. We&apos;ll send a one-time code to verify it&apos;s you.</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl p-6 border border-slate-200 shadow-xl shadow-slate-100">
        <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1.5">Organizer Email</label>
            <input
              type="email"
              className="w-full bg-slate-50 text-slate-900 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 transition"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md shadow-indigo-200"
          >
            {loading ? 'Sending...' : 'Send Verification Code →'}
          </button>
        </form>
      </div>

      <button onClick={() => router.push('/')} className="mt-6 text-slate-400 text-xs underline hover:text-slate-600 transition-colors">
        ← Back to Home
      </button>

      <div className="mt-10 text-center">
        <a href="mailto:curiologhtforyou@gmail.com" className="inline-flex items-center gap-1.5 text-slate-400 text-xs hover:text-indigo-500 transition-colors group">
          <span className="w-5 h-px bg-slate-300 group-hover:bg-indigo-300 transition-colors" />
          Designed &amp; Conceptualized by <span className="font-semibold text-slate-500 group-hover:text-indigo-600">Jigar Pandya</span>
          <span className="w-5 h-px bg-slate-300 group-hover:bg-indigo-300 transition-colors" />
        </a>
      </div>
    </div>
  )

  // ── Step 2: Enter OTP ───────────────────────────────────────────────────────
  if (step === 'otp') return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-blue-50 flex flex-col items-center justify-center px-4 pb-16">
      {brandBar}

      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">✉️</div>
        <h1 className="text-2xl font-bold text-slate-900">Check your email</h1>
        <p className="text-slate-500 text-sm mt-1.5">We sent a 6-digit code to</p>
        <p className="text-indigo-600 font-semibold text-sm mt-0.5">{email}</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl p-6 border border-slate-200 shadow-xl shadow-slate-100">
        <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1.5">6-digit verification code</label>
            <input
              type="text"
              inputMode="numeric"
              className="w-full bg-slate-50 text-slate-900 rounded-xl px-4 py-3 text-xl outline-none border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 transition text-center tracking-[0.4em] font-bold"
              placeholder="000000"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              autoFocus
              required
            />
          </div>
          {error && <p className="text-red-500 text-xs text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || otp.length < 6}
            className="w-full bg-indigo-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md shadow-indigo-200"
          >
            {loading ? 'Verifying...' : 'Verify & See My Events →'}
          </button>
        </form>
      </div>

      <button
        onClick={() => { setStep('email'); setOtp(''); setError('') }}
        className="mt-6 text-slate-400 text-xs underline hover:text-slate-600 transition-colors"
      >
        ← Use a different email
      </button>
    </div>
  )

  // ── Step 3: Events list ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-blue-50 flex flex-col items-center px-4 pt-12 pb-16">
      {brandBar}

      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My Events</h1>
        <p className="text-slate-500 text-sm mt-1">{email}</p>
      </div>

      <div className="w-full max-w-sm">
        {events.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">📭</div>
            <p className="text-slate-700 font-semibold">No events found</p>
            <p className="text-slate-400 text-sm mt-1 max-w-xs mx-auto">Events you create with this email address will appear here.</p>
            <button onClick={() => router.push('/')} className="mt-6 bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold text-sm shadow-md shadow-indigo-200">
              Create an Event
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {events.map(ev => (
              <button
                key={ev.id}
                onClick={() => handleOpenEvent(ev)}
                disabled={openingCode === ev.code}
                className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3 px-4 py-4 hover:border-indigo-300 hover:shadow-md transition-all group text-left disabled:opacity-60"
              >
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-xl shrink-0">👑</div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 text-sm font-semibold truncate">{ev.title}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Code: <span className="font-mono font-bold text-slate-600">{ev.code}</span>
                    {ev.is_locked && <span className="ml-2 text-red-400">🔒 Locked</span>}
                  </p>
                  <p className="text-slate-300 text-[10px] mt-0.5">{new Date(ev.created_at).toLocaleDateString()}</p>
                </div>
                <span className="text-indigo-400 text-lg group-hover:translate-x-0.5 transition-transform shrink-0">
                  {openingCode === ev.code ? '⏳' : '→'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => router.push('/')} className="mt-8 text-slate-400 text-xs underline hover:text-slate-600 transition-colors">
        ← Back to Home
      </button>

      <div className="mt-10 text-center">
        <a href="mailto:curiologhtforyou@gmail.com" className="inline-flex items-center gap-1.5 text-slate-400 text-xs hover:text-indigo-500 transition-colors group">
          <span className="w-5 h-px bg-slate-300 group-hover:bg-indigo-300 transition-colors" />
          Designed &amp; Conceptualized by <span className="font-semibold text-slate-500 group-hover:text-indigo-600">Jigar Pandya</span>
          <span className="w-5 h-px bg-slate-300 group-hover:bg-indigo-300 transition-colors" />
        </a>
      </div>
    </div>
  )
}
