'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { generateCode, saveParticipant, saveOrganizerKey } from '@/lib/utils'

type CreateStep = 'form' | 'otp'

export default function HomePage() {
  const router = useRouter()
  const [tab, setTab] = useState<'create' | 'join'>('create')

  // Create flow
  const [eventTitle, setEventTitle] = useState('')
  const [organizerName, setOrganizerName] = useState('')
  const [organizerEmail, setOrganizerEmail] = useState('')
  const [expiryHours, setExpiryHours] = useState('24')
  const [creating, setCreating] = useState(false)
  const [createStep, setCreateStep] = useState<CreateStep>('form')
  const [pendingCode, setPendingCode] = useState('')
  const [pendingEventId, setPendingEventId] = useState('')
  const [otp, setOtp] = useState('')
  const [verifying, setVerifying] = useState(false)

  // Join flow
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
        .insert({
          title: eventTitle.trim(),
          code,
          organizer_name: organizerName.trim(),
          organizer_key: organizerKey,
          expires_at: expiresAt,
          organizer_email: organizerEmail.trim().toLowerCase() || null,
        })
        .select().single()
      if (eventErr) throw eventErr

      const { data: participant, error: partErr } = await supabase
        .from('participants')
        .insert({ event_id: event.id, name: organizerName.trim(), status: 'approved' })
        .select().single()
      if (partErr) throw partErr

      saveParticipant(code, { id: participant.id, name: organizerName.trim() })
      saveOrganizerKey(code, organizerKey)

      // If email provided → send OTP to link this event to their account
      if (organizerEmail.trim()) {
        const { error: otpErr } = await supabase.auth.signInWithOtp({
          email: organizerEmail.trim().toLowerCase(),
          options: { shouldCreateUser: true },
        })
        if (otpErr) {
          // OTP failed — still navigate, just won't be linked
          router.push(`/event/${code}`)
          return
        }
        setPendingCode(code)
        setPendingEventId(event.id)
        setCreateStep('otp')
        setCreating(false)
        return
      }

      router.push(`/event/${code}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setCreating(false)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setVerifying(true)
    setError('')
    const { data, error } = await supabase.auth.verifyOtp({
      email: organizerEmail.trim().toLowerCase(),
      token: otp.trim(),
      type: 'email',
    })
    if (error) {
      setError('Invalid code. Check your email and try again.')
      setVerifying(false)
      return
    }
    // Link the event to the verified user
    if (data.user) {
      await supabase
        .from('events')
        .update({ organizer_user_id: data.user.id })
        .eq('id', pendingEventId)
    }
    router.push(`/event/${pendingCode}`)
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    router.push(`/join/${code}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-blue-50 flex flex-col items-center justify-center px-4 pb-16">
      {/* Branding */}
      <div className="text-center mb-10">
        <div className="relative inline-block mb-5">
          <div className="absolute inset-0 bg-indigo-400 rounded-3xl blur-xl opacity-30 scale-110" />
          <img src="/logo.png" alt="SnapRain" className="relative w-28 h-28 mx-auto rounded-3xl shadow-2xl shadow-indigo-300 object-cover" />
        </div>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">snap<span className="text-indigo-500">Rain</span></h1>
        <p className="text-slate-500 mt-2 text-sm font-medium leading-relaxed">Every shot, shared with everyone<br/>— instantly 🌧️</p>
        <div className="flex items-center justify-center gap-4 mt-4">
          {['📸 No signup', '⚡ Real-time', '💾 Auto-save'].map(f => (
            <span key={f} className="text-[10px] font-semibold text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">{f}</span>
          ))}
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-xl shadow-slate-100">

        {/* OTP step — shown after create if email was provided */}
        {createStep === 'otp' ? (
          <div className="p-6">
            <div className="text-center mb-5">
              <div className="text-4xl mb-2">✉️</div>
              <h2 className="text-slate-900 font-bold text-lg">Verify your email</h2>
              <p className="text-slate-500 text-xs mt-1">We sent a 6-digit code to</p>
              <p className="text-indigo-600 font-semibold text-sm">{organizerEmail}</p>
              <p className="text-slate-400 text-xs mt-2">Verifying links this event to your account so you can access it anytime.</p>
            </div>
            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
              <input
                type="text"
                inputMode="numeric"
                className="w-full bg-slate-50 text-slate-900 rounded-xl px-4 py-3 text-xl outline-none border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition text-center tracking-[0.4em] font-bold placeholder-slate-300"
                placeholder="000000"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                autoFocus
                required
              />
              {error && <p className="text-red-500 text-xs text-center">{error}</p>}
              <button
                type="submit"
                disabled={verifying || otp.length < 6}
                className="w-full bg-indigo-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md shadow-indigo-200"
              >
                {verifying ? 'Verifying...' : 'Verify & Enter Event →'}
              </button>
            </form>
            <button
              onClick={() => router.push(`/event/${pendingCode}`)}
              className="w-full mt-3 text-slate-400 text-xs text-center underline hover:text-slate-600 transition-colors"
            >
              Skip for now (event won&apos;t be linked to account)
            </button>
          </div>
        ) : (
          <>
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
                    <label className="text-xs font-medium text-slate-500 block mb-1.5">
                      Your Email <span className="text-indigo-400 font-normal">(to access events from any device)</span>
                    </label>
                    <input
                      type="email"
                      className="w-full bg-slate-50 text-slate-900 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 transition"
                      placeholder="you@example.com (optional)"
                      value={organizerEmail}
                      onChange={e => setOrganizerEmail(e.target.value)}
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
          </>
        )}
      </div>

      {/* My Past Events link */}
      <button
        onClick={() => router.push('/my-events')}
        className="mt-5 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 shadow-sm hover:border-indigo-300 hover:text-indigo-600 hover:shadow-md transition-all group"
      >
        <span className="text-base">👑</span>
        Organizer? View your past events
        <span className="text-indigo-400 group-hover:translate-x-0.5 transition-transform">→</span>
      </button>

      <div className="mt-8 text-center">
        <a
          href="mailto:curiologhtforyou@gmail.com"
          className="inline-flex items-center gap-1.5 text-slate-400 text-xs hover:text-indigo-500 transition-colors group"
        >
          <span className="w-5 h-px bg-slate-300 group-hover:bg-indigo-300 transition-colors" />
          Designed &amp; Conceptualized by <span className="font-semibold text-slate-500 group-hover:text-indigo-600">Jigar Pandya</span>
          <span className="w-5 h-px bg-slate-300 group-hover:bg-indigo-300 transition-colors" />
        </a>
      </div>
    </div>
  )
}
