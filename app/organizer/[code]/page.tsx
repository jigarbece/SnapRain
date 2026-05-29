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
  const [tab, setTab] = useState<'photos' | 'people'>('photos')
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
        (p) => setParticipants(prev => [...prev, p.new as Participant]))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [event])

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

  // Photos per participant
  const photoCounts = photos.reduce<Record<string, number>>((acc, p) => {
    acc[p.participant_name] = (acc[p.participant_name] || 0) + 1
    return acc
  }, {})

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-zinc-500 animate-pulse text-sm">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 text-white text-xs px-5 py-2.5 rounded-full shadow-xl pointer-events-none">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-zinc-800 z-30 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/event/${code}`)} className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-sm">←</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-base truncate">👑 {event?.title}</h1>
            <p className="text-zinc-500 text-xs">{participants.length} people · {photos.length} photos</p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-px bg-zinc-800 border-b border-zinc-800">
        {[
          { label: 'Photos', value: photos.length },
          { label: 'People', value: participants.length },
          { label: 'Code', value: code },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 px-4 py-3 text-center">
            <p className="text-white font-bold text-lg">{s.value}</p>
            <p className="text-zinc-500 text-xs">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        <button onClick={() => setTab('photos')} className={`flex-1 py-3 text-sm font-semibold ${tab === 'photos' ? 'text-white border-b-2 border-white' : 'text-zinc-500'}`}>Photos</button>
        <button onClick={() => setTab('people')} className={`flex-1 py-3 text-sm font-semibold ${tab === 'people' ? 'text-white border-b-2 border-white' : 'text-zinc-500'}`}>People</button>
      </div>

      {/* Content */}
      <div className="flex-1 p-3">
        {tab === 'photos' ? (
          <>
            {photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-4xl mb-3">📷</div>
                <p className="text-zinc-400 text-sm">No photos yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                {photos.map(photo => (
                  <PhotoCard key={photo.id} photo={photo} canDelete onDelete={handleDelete} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {participants.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-zinc-900 rounded-xl px-4 py-3">
                <div>
                  <p className="text-white text-sm font-medium">{p.name}</p>
                  <p className="text-zinc-500 text-xs">Joined {new Date(p.joined_at).toLocaleTimeString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">{photoCounts[p.name] || 0}</p>
                  <p className="text-zinc-500 text-xs">photos</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="sticky bottom-0 bg-black/95 border-t border-zinc-800 p-4">
        <div className="flex gap-3">
          <button
            onClick={handleDownloadAll}
            disabled={downloadingAll || photos.length === 0}
            className="flex-1 bg-white text-black py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
          >
            {downloadingAll ? 'Saving...' : `⬇ Save All (${photos.length})`}
          </button>
          <button
            onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/join/${code}`); showToast('Link copied!') }}
            className="bg-zinc-800 text-white px-4 py-3 rounded-xl font-semibold text-sm"
          >
            🔗
          </button>
        </div>
      </div>
    </div>
  )
}
