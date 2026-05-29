'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, Event, Photo, Participant } from '@/lib/supabase'
import { getOrganizerKey, downloadAllOneByOne } from '@/lib/utils'
import PhotoCard from '@/components/PhotoCard'

export default function OrganizerPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()

  const [event, setEvent] = useState<Event | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'photos' | 'people' | 'requests' | 'settings'>('photos')
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [toast, setToast] = useState('')
  const [welcomeMsg, setWelcomeMsg] = useState('')
  const [themeColor, setThemeColor] = useState('#4f46e5')
  const [savingSettings, setSavingSettings] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  useEffect(() => {
    const orgKey = getOrganizerKey(code)
    if (!orgKey) { router.push(`/event/${code}`); return }

    async function load() {
      const { data: ev } = await supabase.from('events').select().eq('code', code).single()
      if (!ev || ev.organizer_key !== orgKey) { router.push('/'); return }
      setEvent(ev)

      const { data: ph } = await supabase.from('photos').select().eq('event_id', ev.id).order('created_at', { ascending: false })
      setPhotos(ph || [])

      const { data: parts } = await supabase.from('participants').select().eq('event_id', ev.id).order('joined_at')
      setParticipants(parts || [])
      setWelcomeMsg(ev.welcome_message || '')
      setThemeColor(ev.theme_color || '#4f46e5')
      setLoading(false)
    }
    load()
  }, [code, router])

  // Real-time
  useEffect(() => {
    if (!event) return
    const channel = supabase.channel(`org_${event.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos', filter: `event_id=eq.${event.id}` },
        (p) => setPhotos(prev => [p.new as Photo, ...prev]))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'photos', filter: `event_id=eq.${event.id}` },
        (p) => setPhotos(prev => prev.filter(ph => ph.id !== (p.old as Photo).id)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `event_id=eq.${event.id}` },
        (p) => {
          setParticipants(prev => [...prev, p.new as Participant])
          // Auto-switch to requests tab when new request comes in
          setTab('requests')
          showToast('🔔 New join request!')
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'participants', filter: `event_id=eq.${event.id}` },
        (p) => setParticipants(prev => prev.map(part => part.id === (p.new as Participant).id ? p.new as Participant : part)))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [event])

  async function handleSaveSettings() {
    if (!event) return
    setSavingSettings(true)
    const { error } = await supabase.from('events').update({ welcome_message: welcomeMsg, theme_color: themeColor }).eq('id', event.id)
    setSavingSettings(false)
    if (error) { showToast(`Error: ${error.message}`); console.error(error); return }
    setEvent(prev => prev ? { ...prev, welcome_message: welcomeMsg, theme_color: themeColor } : prev)
    showToast('✅ Settings saved!')
  }

  async function handleCoverPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !event) return
    showToast('Uploading cover...')
    const path = `covers/${event.id}_${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('photos').upload(path, file, { contentType: file.type, upsert: true })
    if (upErr) { showToast(`Upload failed: ${upErr.message}`); console.error(upErr); return }
    const { data } = supabase.storage.from('photos').getPublicUrl(path)
    const { error: dbErr } = await supabase.from('events').update({ cover_photo: data.publicUrl }).eq('id', event.id)
    if (dbErr) { showToast(`Save failed: ${dbErr.message}`); console.error(dbErr); return }
    setEvent(prev => prev ? { ...prev, cover_photo: data.publicUrl } : prev)
    showToast('✅ Cover photo updated!')
  }

  async function handleDeleteEvent() {
    if (!event) return
    setDeleting(true)
    // Delete all photos from storage
    if (photos.length > 0) {
      const paths = photos.map(p => p.storage_path)
      await supabase.storage.from('photos').remove(paths)
    }
    // Delete event (cascades to photos + participants in DB)
    await supabase.from('events').delete().eq('id', event.id)
    router.push('/')
  }

  async function handleToggleLock() {
    if (!event) return
    const newLocked = !event.is_locked
    const { error } = await supabase.from('events').update({ is_locked: newLocked }).eq('id', event.id)
    if (error) { showToast(`Error: ${error.message}`); return }
    setEvent(prev => prev ? { ...prev, is_locked: newLocked } : prev)
    showToast(newLocked ? '🔒 Event locked — no new photos' : '🔓 Event unlocked')
  }

  async function handleApprove(participantId: string) {
    await supabase.from('participants').update({ status: 'approved' }).eq('id', participantId)
    setParticipants(prev => prev.map(p => p.id === participantId ? { ...p, status: 'approved' as const } : p))
    showToast('✅ Approved!')
  }

  async function handleDeny(participantId: string) {
    await supabase.from('participants').delete().eq('id', participantId)
    setParticipants(prev => prev.filter(p => p.id !== participantId))
    showToast('Removed')
  }

  async function handleDelete(photoId: string) {
    const photo = photos.find(p => p.id === photoId)
    if (!photo) return
    setPhotos(prev => prev.filter(p => p.id !== photoId))  // update UI immediately
    await supabase.storage.from('photos').remove([photo.storage_path])
    await supabase.from('photos').delete().eq('id', photoId)
    showToast('Photo deleted')
  }

  async function handleDownloadAll() {
    if (photos.length === 0) return
    setDownloadingAll(true)
    showToast(`Downloading ${photos.length} photos...`)
    await downloadAllOneByOne(photos)
    setDownloadingAll(false)
    showToast('✅ All photos saved!')
  }

  const pendingParticipants = participants.filter(p => p.status === 'pending')
  const approvedParticipants = participants.filter(p => p.status === 'approved')

  const photoCounts = photos.reduce<Record<string, number>>((acc, p) => {
    acc[p.participant_name] = (acc[p.participant_name] || 0) + 1
    return acc
  }, {})

  // Stats
  const topContributor = Object.entries(photoCounts).sort((a, b) => b[1] - a[1])[0]
  const peakHour = (() => {
    const hours: Record<number, number> = {}
    photos.forEach(p => { const h = new Date(p.created_at).getHours(); hours[h] = (hours[h] || 0) + 1 })
    const peak = Object.entries(hours).sort((a, b) => b[1] - a[1])[0]
    if (!peak) return 'N/A'
    const h = parseInt(peak[0]); const ampm = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12
    return `${h12}:00 ${ampm}`
  })()

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white text-xs px-5 py-2.5 rounded-full shadow-xl shadow-indigo-200 pointer-events-none">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 z-30 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/event/${code}`)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm text-slate-600 hover:bg-slate-200 transition-colors">←</button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <img src="/logo.png" alt="SnapRain" className="w-4 h-4 object-contain" />
              <span className="text-indigo-500 text-[10px] font-bold tracking-wide uppercase">SnapRain</span>
            </div>
            <h1 className="text-slate-900 font-bold text-base truncate">👑 {event?.title}</h1>
            <p className="text-slate-400 text-xs">{approvedParticipants.length} approved · {photos.length} photos</p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-px bg-slate-200 border-b border-slate-200">
        {[
          { label: 'Photos', value: photos.length, color: 'text-slate-900' },
          { label: 'Approved', value: approvedParticipants.length, color: 'text-green-600' },
          { label: 'Pending', value: pendingParticipants.length, color: pendingParticipants.length > 0 ? 'text-amber-500' : 'text-slate-900' },
          { label: 'Code', value: code, color: 'text-indigo-600' },
        ].map(s => (
          <div key={s.label} className="bg-white px-2 py-3 text-center">
            <p className={`font-bold text-base ${s.color}`}>{s.value}</p>
            <p className="text-slate-400 text-xs">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white overflow-x-auto">
        <button onClick={() => setTab('photos')} className={`flex-1 py-3 text-xs font-semibold whitespace-nowrap px-2 transition-colors ${tab === 'photos' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}>
          📷 Photos
        </button>
        <button onClick={() => setTab('people')} className={`flex-1 py-3 text-xs font-semibold whitespace-nowrap px-2 transition-colors ${tab === 'people' ? 'text-green-600 border-b-2 border-green-500 bg-green-50' : 'text-slate-400 hover:text-slate-600'}`}>
          👥 People
        </button>
        <button onClick={() => setTab('requests')} className={`flex-1 py-3 text-xs font-semibold whitespace-nowrap px-2 relative transition-colors ${tab === 'requests' ? 'text-amber-600 border-b-2 border-amber-500 bg-amber-50' : 'text-slate-400 hover:text-slate-600'}`}>
          🔔 Requests
          {pendingParticipants.length > 0 && (
            <span className="absolute top-2 right-1 w-4 h-4 bg-amber-400 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {pendingParticipants.length}
            </span>
          )}
        </button>
        <button onClick={() => setTab('settings')} className={`flex-1 py-3 text-xs font-semibold whitespace-nowrap px-2 transition-colors ${tab === 'settings' ? 'text-purple-600 border-b-2 border-purple-500 bg-purple-50' : 'text-slate-400 hover:text-slate-600'}`}>
          ⚙️ Settings
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-3">
        {tab === 'photos' ? (
          <>
            {photos.length > 0 && (
              <div className="mb-3">
                <button
                  onClick={handleDownloadAll}
                  disabled={downloadingAll}
                  className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm shadow-indigo-200 flex items-center justify-center gap-2"
                >
                  {downloadingAll ? '⏳ Preparing...' : `⬇ Save All ${photos.length} Photos`}
                </button>
              </div>
            )}
            {photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">📷</div>
                <p className="text-slate-500 text-sm">No photos yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {photos.map(photo => (
                  <PhotoCard key={photo.id} photo={photo} canDelete onDelete={handleDelete} />
                ))}
              </div>
            )}
          </>
        ) : tab === 'people' ? (
          <div className="flex flex-col gap-2">
            {approvedParticipants.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">👥</div>
                <p className="text-slate-500 text-sm">No approved participants yet</p>
              </div>
            )}
            {approvedParticipants.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-slate-200 shadow-sm">
                <div>
                  <p className="text-slate-900 text-sm font-medium">{p.name}</p>
                  <p className="text-slate-400 text-xs">Joined {new Date(p.joined_at).toLocaleTimeString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-indigo-600 font-bold">{photoCounts[p.name] || 0}</p>
                    <p className="text-slate-400 text-xs">photos</p>
                  </div>
                  <button onClick={() => handleDeny(p.id)} className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-sm hover:bg-red-100 transition-colors" title="Remove">🚫</button>
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'requests' ? (
          <div className="flex flex-col gap-2">
            {pendingParticipants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">✅</div>
                <p className="text-slate-500 text-sm">No pending requests</p>
              </div>
            ) : (
              <>
                <p className="text-slate-400 text-xs px-1 mb-1">Approve or deny each person below</p>
                {pendingParticipants.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-200 shadow-sm">
                    <div>
                      <p className="text-slate-900 text-sm font-semibold">{p.name}</p>
                      <p className="text-slate-400 text-xs">Requested {new Date(p.joined_at).toLocaleTimeString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeny(p.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-50 text-red-500 text-xs font-semibold hover:bg-red-100 transition-colors border border-red-100"
                      >
                        Deny
                      </button>
                      <button
                        onClick={() => handleApprove(p.id)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                      >
                        Approve ✓
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : tab === 'settings' ? (
          <div className="flex flex-col gap-4 pb-6">

            {/* Stats */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-slate-900 text-sm font-bold mb-3">📊 Event Stats</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Total Photos', value: photos.length },
                  { label: 'Total Guests', value: approvedParticipants.length },
                  { label: 'Top Contributor', value: topContributor ? `${topContributor[0]} (${topContributor[1]})` : 'N/A' },
                  { label: 'Peak Hour', value: peakHour },
                  { label: 'Avg per Guest', value: approvedParticipants.length ? (photos.length / approvedParticipants.length).toFixed(1) : '0' },
                  { label: 'Status', value: event?.is_locked ? '🔒 Locked' : '🟢 Active' },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-indigo-600 font-bold text-sm truncate">{s.value}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Cover Photo */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {event?.cover_photo && (
                <img src={event.cover_photo} alt="Cover" className="w-full h-36 object-cover" />
              )}
              <div className="p-4">
                <p className="text-slate-900 text-sm font-semibold mb-1">Cover Photo</p>
                <p className="text-slate-400 text-xs mb-3">Shown at the top of the event page</p>
                <label className="block w-full bg-slate-100 text-slate-700 py-2.5 rounded-xl font-semibold text-sm text-center cursor-pointer hover:bg-slate-200 transition-colors">
                  📷 {event?.cover_photo ? 'Change Cover' : 'Upload Cover'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleCoverPhoto} />
                </label>
              </div>
            </div>

            {/* Welcome Message */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-slate-900 text-sm font-semibold mb-1">Welcome Message</p>
              <p className="text-slate-400 text-xs mb-3">Shown to guests when they join</p>
              <textarea
                value={welcomeMsg}
                onChange={e => setWelcomeMsg(e.target.value)}
                placeholder="Welcome to our wedding! Capture every moment 📸"
                rows={3}
                className="w-full bg-slate-50 text-slate-900 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 placeholder-slate-400 resize-none transition"
              />
            </div>

            {/* Theme Colour */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-slate-900 text-sm font-semibold mb-1">Theme Colour</p>
              <p className="text-slate-400 text-xs mb-3">Accent colour used throughout the event</p>
              <div className="flex items-center gap-3">
                <input type="color" value={themeColor} onChange={e => setThemeColor(e.target.value)}
                  className="w-12 h-12 rounded-xl border border-slate-200 cursor-pointer p-1" />
                <div className="flex gap-2 flex-wrap">
                  {['#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'].map(c => (
                    <button key={c} onClick={() => setThemeColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${themeColor === c ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="w-full bg-purple-600 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-md"
            >
              {savingSettings ? 'Saving...' : '✅ Save Settings'}
            </button>

            {/* Danger zone */}
            <div className="bg-white rounded-xl border border-red-200 p-4">
              <p className="text-red-600 text-sm font-bold mb-1">⚠️ Danger Zone</p>
              <p className="text-slate-400 text-xs mb-3">Permanently deletes the event, all photos and all participants. This cannot be undone.</p>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full bg-red-50 text-red-600 py-3 rounded-xl font-semibold text-sm hover:bg-red-100 transition-colors border border-red-200"
              >
                🗑 Delete Event Permanently
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom bar — share + lock only */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 shadow-lg">
        <div className="flex gap-3">
          <button
            onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/join/${code}`); showToast('Link copied!') }}
            className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors"
          >
            🔗 Copy Invite Link
          </button>
          <button
            onClick={handleToggleLock}
            className={`px-5 py-3 rounded-xl font-semibold text-sm transition-colors ${event?.is_locked ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            title={event?.is_locked ? 'Unlock event' : 'Lock event'}
          >
            {event?.is_locked ? '🔒 Locked' : '🔓 Lock'}
          </button>
        </div>
      </div>
      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-4xl text-center mb-3">⚠️</div>
            <h3 className="text-slate-900 font-bold text-lg text-center mb-2">Delete Event?</h3>
            <p className="text-slate-500 text-sm text-center mb-1">This will permanently delete:</p>
            <ul className="text-slate-600 text-sm text-center mb-5 space-y-0.5">
              <li>📷 {photos.length} photos</li>
              <li>👥 {participants.length} participants</li>
              <li>🗂 The entire event</li>
            </ul>
            <p className="text-red-500 text-xs text-center font-semibold mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEvent}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
