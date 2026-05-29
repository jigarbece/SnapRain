'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, Event, Photo } from '@/lib/supabase'
import {
  getParticipant, getOrganizerKey, getAutoSave, setAutoSave as persistAutoSave,
  downloadPhoto, downloadAllOneByOne, autoSavePhoto, compressImage
} from '@/lib/utils'
import Camera from '@/components/Camera'
import PhotoCard from '@/components/PhotoCard'

export default function EventPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()

  const [event, setEvent] = useState<Event | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [participantCount, setParticipantCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showCamera, setShowCamera] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [autoSave, setAutoSaveState] = useState(false)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState({ done: 0, total: 0 })
  const [toast, setToast] = useState('')
  const autoSaveRef = useRef(false)

  const participant = getParticipant(code)
  const isOrganizer = !!getOrganizerKey(code)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  useEffect(() => {
    async function load() {
      const { data: ev } = await supabase.from('events').select().eq('code', code).single()
      if (!ev) { router.push('/'); return }
      setEvent(ev)

      const { data: ph } = await supabase
        .from('photos').select().eq('event_id', ev.id).order('created_at', { ascending: false })
      setPhotos(ph || [])

      const { count } = await supabase
        .from('participants').select('id', { count: 'exact', head: true }).eq('event_id', ev.id)
      setParticipantCount(count || 0)

      const saved = getAutoSave(code)
      setAutoSaveState(saved)
      autoSaveRef.current = saved
      setLoading(false)
    }
    load()
  }, [code, router])

  useEffect(() => {
    if (!event) return
    const channel = supabase
      .channel(`event_${event.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos', filter: `event_id=eq.${event.id}` },
        (payload) => {
          const newPhoto = payload.new as Photo
          setPhotos(prev => prev.find(p => p.id === newPhoto.id) ? prev : [newPhoto, ...prev])
          if (autoSaveRef.current && newPhoto.participant_id !== participant?.id) {
            autoSavePhoto(newPhoto.url).catch(() => {})
          }
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'photos', filter: `event_id=eq.${event.id}` },
        (payload) => setPhotos(prev => prev.filter(p => p.id !== (payload.old as Photo).id))
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [event, participant?.id])

  const handleCapturedPhoto = useCallback(async (blob: Blob) => {
    if (!event || !participant) return
    setUploading(true)
    try {
      const compressed = await compressImage(blob)
      const fileName = `${event.id}/${participant.id}_${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('photos').upload(fileName, compressed, { contentType: 'image/jpeg' })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName)
      const { data: rec, error: dbErr } = await supabase.from('photos').insert({
        event_id: event.id, participant_id: participant.id, participant_name: participant.name,
        storage_path: fileName, url: urlData.publicUrl,
      }).select().single()
      if (dbErr) throw dbErr
      setPhotos(prev => [rec, ...prev])
      showToast('📸 Photo shared!')
    } catch (err) {
      showToast('Upload failed. Try again.')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }, [event, participant])

  async function handleDelete(photoId: string) {
    const photo = photos.find(p => p.id === photoId)
    if (!photo) return
    await supabase.storage.from('photos').remove([photo.storage_path])
    await supabase.from('photos').delete().eq('id', photoId)
  }

  async function handleDownloadAll() {
    if (photos.length === 0) return
    setDownloadingAll(true)
    setDownloadProgress({ done: 0, total: photos.length })
    showToast(`Downloading ${photos.length} photos...`)
    await downloadAllOneByOne(photos, (done, total) => {
      setDownloadProgress({ done, total })
    })
    setDownloadingAll(false)
    setDownloadProgress({ done: 0, total: 0 })
    showToast('✅ All photos saved!')
  }

  function toggleAutoSave(val: boolean) {
    setAutoSaveState(val)
    autoSaveRef.current = val
    persistAutoSave(code, val)
    showToast(val ? '✅ Auto-save ON — new photos save automatically' : 'Auto-save OFF')
  }

  function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: event?.title, text: `Join my photo album! Code: ${code}`, url: `${window.location.origin}/join/${code}` })
    } else {
      navigator.clipboard?.writeText(`${window.location.origin}/join/${code}`)
      showToast('Link copied!')
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-zinc-500 animate-pulse text-sm">Loading event...</p>
    </div>
  )

  if (!participant) { router.push('/'); return null }

  return (
    <div className="min-h-screen bg-black flex flex-col pb-24">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 text-white text-xs px-5 py-2.5 rounded-full shadow-xl pointer-events-none">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-zinc-800 z-30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-white font-bold text-base truncate">{event?.title}</h1>
            <p className="text-zinc-500 text-xs">{participantCount} people · {photos.length} photos</p>
          </div>
          <div className="flex gap-2 ml-3 shrink-0">
            <button onClick={() => setShowShare(true)} className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-base" title="Share">🔗</button>
            <button onClick={() => setShowSettings(true)} className={`w-9 h-9 rounded-full flex items-center justify-center text-base ${autoSave ? 'bg-green-700' : 'bg-zinc-800'}`} title="Settings">⚙️</button>
            {isOrganizer && (
              <button onClick={() => router.push(`/organizer/${code}`)} className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-base" title="Organizer">👑</button>
            )}
          </div>
        </div>
      </div>

      {/* Photos Grid */}
      <div className="flex-1 p-2">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-5xl mb-4">📷</div>
            <p className="text-zinc-400 text-sm font-medium">No photos yet</p>
            <p className="text-zinc-600 text-xs mt-1">Tap the camera button to take the first shot!</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5">
            {photos.map(photo => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                canDelete={isOrganizer || photo.participant_id === participant.id}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur border-t border-zinc-800 px-8 py-4 z-30">
        <div className="flex items-center justify-between max-w-sm mx-auto">
          {/* Download all */}
          <button
            onClick={handleDownloadAll}
            disabled={downloadingAll || photos.length === 0}
            className="flex flex-col items-center gap-1 disabled:opacity-40 text-zinc-400 hover:text-white transition-colors"
          >
            <span className="text-2xl">⬇️</span>
            <span className="text-[10px]">
              {downloadingAll
                ? `${downloadProgress.done}/${downloadProgress.total}`
                : 'Save All'}
            </span>
          </button>

          {/* Camera */}
          <button
            onClick={() => setShowCamera(true)}
            className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
          >
            <span className="text-2xl">📸</span>
          </button>

          {/* Auto-save */}
          <button
            onClick={() => toggleAutoSave(!autoSave)}
            className="flex flex-col items-center gap-1"
          >
            <span className="text-2xl">{autoSave ? '💾' : '📥'}</span>
            <span className={`text-[10px] ${autoSave ? 'text-green-400 font-semibold' : 'text-zinc-400'}`}>
              {autoSave ? 'Auto ON' : 'Auto-save'}
            </span>
          </button>
        </div>
      </div>

      {/* Camera */}
      {showCamera && <Camera onCapture={handleCapturedPhoto} onClose={() => setShowCamera(false)} uploading={uploading} />}

      {/* Settings Sheet */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 z-40 flex items-end" onClick={() => setShowSettings(false)}>
          <div className="w-full bg-zinc-900 rounded-t-3xl p-6 border-t border-zinc-800" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-6" />
            <h2 className="text-white font-bold text-xl mb-6">Settings</h2>

            <div className="flex items-center justify-between py-4 border-b border-zinc-800">
              <div>
                <p className="text-white text-sm font-semibold">Auto-Save Photos</p>
                <p className="text-zinc-500 text-xs mt-0.5">New group photos auto-download to your gallery</p>
              </div>
              <button
                onClick={() => toggleAutoSave(!autoSave)}
                className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${autoSave ? 'bg-green-500' : 'bg-zinc-700'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${autoSave ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="py-4 border-b border-zinc-800">
              <p className="text-zinc-400 text-xs mb-1">Your name</p>
              <p className="text-white text-sm">{participant.name} {isOrganizer ? '👑 (organizer)' : ''}</p>
            </div>

            <div className="py-4 border-b border-zinc-800">
              <p className="text-zinc-400 text-xs mb-1">Event code</p>
              <p className="text-white font-mono text-2xl font-bold tracking-widest">{code}</p>
            </div>

            {event?.expires_at && (
              <div className="py-4">
                <p className="text-zinc-400 text-xs mb-1">Event expires</p>
                <p className="text-white text-sm">{new Date(event.expires_at).toLocaleString()}</p>
              </div>
            )}

            <button onClick={() => setShowSettings(false)} className="w-full mt-4 bg-zinc-800 text-white py-3.5 rounded-xl font-semibold">Done</button>
          </div>
        </div>
      )}

      {/* Share Sheet */}
      {showShare && (
        <div className="fixed inset-0 bg-black/80 z-40 flex items-end" onClick={() => setShowShare(false)}>
          <div className="w-full bg-zinc-900 rounded-t-3xl p-6 border-t border-zinc-800" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-6" />
            <h2 className="text-white font-bold text-xl mb-1">Invite Friends</h2>
            <p className="text-zinc-500 text-sm mb-6">Share the code or scan the QR</p>

            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="bg-white p-4 rounded-2xl">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : ''}/join/${code}`)}`}
                  alt="QR Code"
                  width={180}
                  height={180}
                  className="rounded"
                />
              </div>
              <div className="text-center">
                <p className="text-zinc-500 text-xs mb-1">Event Code</p>
                <p className="text-white font-mono text-4xl font-black tracking-widest">{code}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/join/${code}`); showToast('Link copied!') }}
                className="flex-1 bg-zinc-800 text-white py-3.5 rounded-xl font-semibold text-sm"
              >
                📋 Copy Link
              </button>
              <button onClick={handleShare} className="flex-1 bg-white text-black py-3.5 rounded-xl font-semibold text-sm">
                Share ↗
              </button>
            </div>

            <button onClick={() => setShowShare(false)} className="w-full mt-3 bg-zinc-800 text-white py-3.5 rounded-xl font-semibold text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
