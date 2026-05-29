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
  const [tab, setTab] = useState<'photos' | 'people' | 'requests'>('photos')
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [toast, setToast] = useState('')

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
      <div className="flex border-b border-slate-200 bg-white">
        <button onClick={() => setTab('photos')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'photos' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}>
          📷 Photos
        </button>
        <button onClick={() => setTab('people')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'people' ? 'text-green-600 border-b-2 border-green-500 bg-green-50' : 'text-slate-400 hover:text-slate-600'}`}>
          👥 People
        </button>
        <button onClick={() => setTab('requests')} className={`flex-1 py-3 text-sm font-semibold relative transition-colors ${tab === 'requests' ? 'text-amber-600 border-b-2 border-amber-500 bg-amber-50' : 'text-slate-400 hover:text-slate-600'}`}>
          🔔 Requests
          {pendingParticipants.length > 0 && (
            <span className="absolute top-2 right-2 w-4 h-4 bg-amber-400 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {pendingParticipants.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-3">
        {tab === 'photos' ? (
          <>
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
        ) : (
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
        )}
      </div>

      {/* Bottom actions */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 shadow-lg">
        <div className="flex gap-3">
          <button
            onClick={handleDownloadAll}
            disabled={downloadingAll || photos.length === 0}
            className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200"
          >
            {downloadingAll ? 'Saving...' : `⬇ Save All (${photos.length})`}
          </button>
          <button
            onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/join/${code}`); showToast('Link copied!') }}
            className="bg-slate-100 text-slate-700 px-4 py-3 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors"
          >
            🔗
          </button>
        </div>
      </div>
    </div>
  )
}
