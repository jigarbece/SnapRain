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
import FilterPicker, { FilterName } from '@/components/FilterPicker'

export default function EventPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()

  const [event, setEvent] = useState<Event | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [participantCount, setParticipantCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [approved, setApproved] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [autoSave, setAutoSaveState] = useState(false)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState({ done: 0, total: 0 })
  const [toast, setToast] = useState('')
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null)
  const [filteredBlob, setFilteredBlob] = useState<Blob | null>(null)
  const [caption, setCaption] = useState('')
  const [showPeople, setShowPeople] = useState(false)
  const [approvedList, setApprovedList] = useState<{id: string; name: string}[]>([])
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const autoSaveRef = useRef(false)
  const savedPhotoIds = useRef<Set<string>>(new Set())

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

      const { data: parts, count } = await supabase
        .from('participants').select('id, name', { count: 'exact' }).eq('event_id', ev.id).eq('status', 'approved')
      setParticipantCount(count || 0)
      setApprovedList(parts || [])

      // Check approval status (organizer is always approved)
      const orgKey = getOrganizerKey(code)
      if (orgKey) {
        setApproved(true)
      } else if (participant) {
        const { data: part } = await supabase.from('participants').select('status').eq('id', participant.id).single()
        if (part?.status === 'approved') {
          setApproved(true)
        } else {
          router.push(`/join/${code}`)
          return
        }
      }

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
          if (autoSaveRef.current && newPhoto.participant_id !== participant?.id && !savedPhotoIds.current.has(newPhoto.id)) {
            savedPhotoIds.current.add(newPhoto.id)
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
    setShowCamera(false)
    if (blob.type.startsWith('video/')) {
      setFilteredBlob(blob)  // skip filters for video, go straight to caption
    } else {
      setPendingBlob(blob)   // show filter picker for photos
    }
    setCaption('')
  }, [event, participant])

  function handleFilterConfirm(filtered: Blob, _filter: FilterName) {
    setFilteredBlob(filtered)
    setPendingBlob(null)  // close filter picker, open caption modal
  }

  async function handleUploadWithCaption() {
    if (!filteredBlob || !event || !participant) return
    const isVideo = filteredBlob.type.startsWith('video/')
    setUploading(true)
    setFilteredBlob(null)
    try {
      const ext = isVideo ? 'mp4' : 'jpg'
      const contentType = isVideo ? filteredBlob.type : 'image/jpeg'
      const fileData = isVideo ? filteredBlob : await compressImage(filteredBlob)
      const fileName = `${event.id}/${participant.id}_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('photos').upload(fileName, fileData, { contentType })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName)
      const { data: rec, error: dbErr } = await supabase.from('photos').insert({
        event_id: event.id, participant_id: participant.id, participant_name: participant.name,
        storage_path: fileName, url: urlData.publicUrl, caption: caption.trim() || null,
        media_type: isVideo ? 'video' : 'photo',
      }).select().single()
      if (dbErr) throw dbErr
      setPhotos(prev => [rec, ...prev])
      savedPhotoIds.current.add(rec.id)
      if (!isVideo) autoSavePhoto(urlData.publicUrl).catch(() => {})
      showToast(isVideo ? '🎥 Video shared!' : '📸 Photo shared!')
    } catch (err) {
      showToast('Upload failed. Try again.')
      console.error(err)
    } finally {
      setUploading(false)
      setCaption('')
    }
  }

  async function handleDelete(photoId: string) {
    const photo = photos.find(p => p.id === photoId)
    if (!photo) return
    await supabase.storage.from('photos').remove([photo.storage_path])
    await supabase.from('photos').delete().eq('id', photoId)
  }

  async function handleDownloadAll() {
    if (photos.length === 0) return
    const unsaved = photos.filter(p => !savedPhotoIds.current.has(p.id))
    const alreadySaved = photos.length - unsaved.length

    if (unsaved.length === 0) {
      showToast(`✅ All ${photos.length} photos already saved!`)
      return
    }

    if (alreadySaved > 0) {
      showToast(`Skipping ${alreadySaved} already saved · Fetching ${unsaved.length} new...`)
    } else {
      showToast(`Fetching ${unsaved.length} photo${unsaved.length > 1 ? 's' : ''}...`)
    }

    setDownloadingAll(true)
    setDownloadProgress({ done: 0, total: unsaved.length })

    await downloadAllOneByOne(unsaved, (done, total) => {
      const photo = unsaved[done - 1]
      if (photo) savedPhotoIds.current.add(photo.id)
      setDownloadProgress({ done, total })
    })

    setDownloadingAll(false)
    setDownloadProgress({ done: 0, total: 0 })
    showToast('✅ Done! Tap "Save X Images" to save to Camera Roll')
  }

  async function handleDownloadSelected() {
    const selected = photos.filter(p => selectedIds.has(p.id))
    if (selected.length === 0) return
    showToast(`Fetching ${selected.length} photos...`)
    await downloadAllOneByOne(selected)
    selected.forEach(p => savedPhotoIds.current.add(p.id))
    setSelectMode(false)
    setSelectedIds(new Set())
    showToast('✅ Selected photos saved!')
  }

  function toggleAutoSave(val: boolean) {
    setAutoSaveState(val)
    autoSaveRef.current = val
    persistAutoSave(code, val)
    showToast(val ? '✅ Auto-save ON' : 'Auto-save OFF')
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Loading event...</p>
      </div>
    </div>
  )

  if (!participant) { router.push('/'); return null }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-24">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white text-xs px-5 py-2.5 rounded-full shadow-xl shadow-indigo-200 pointer-events-none">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 z-30 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-slate-900 font-bold text-base truncate">{event?.title}</h1>
            <p className="text-slate-400 text-xs">{participantCount} people · {photos.length} photos</p>
          </div>
          <div className="flex gap-2 ml-3 shrink-0">
            <button onClick={() => setShowPeople(true)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-base hover:bg-slate-200 transition-colors" title="People">👥</button>
            <button onClick={() => { setSelectMode(s => !s); setSelectedIds(new Set()) }} className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-colors ${selectMode ? 'bg-indigo-600 text-white' : 'bg-slate-100 hover:bg-slate-200'}`} title="Select">☑️</button>
            <button onClick={() => setShowShare(true)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-base hover:bg-slate-200 transition-colors" title="Share">🔗</button>
            <button onClick={() => setShowSettings(true)} className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-colors ${autoSave ? 'bg-green-100' : 'bg-slate-100 hover:bg-slate-200'}`} title="Settings">⚙️</button>
            {isOrganizer && (
              <button onClick={() => router.push(`/organizer/${code}`)} className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-base hover:bg-indigo-200 transition-colors" title="Organizer">👑</button>
            )}
          </div>
        </div>
      </div>

      {/* Cover photo */}
      {event?.cover_photo && (
        <div className="w-full h-36 overflow-hidden">
          <img src={event.cover_photo} alt="Event cover" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Welcome message */}
      {event?.welcome_message && (
        <div className="mx-3 mt-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
          <p className="text-indigo-700 text-xs font-medium">💬 {event.welcome_message}</p>
        </div>
      )}

      {/* Locked banner */}
      {event?.is_locked && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2">
          <span>🔒</span>
          <p className="text-red-600 text-xs font-semibold">This event is locked — no new photos can be added</p>
        </div>
      )}

      {/* Photos Grid */}
      <div className="flex-1 p-3">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 bg-indigo-100 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4">📷</div>
            <p className="text-slate-700 text-sm font-semibold">No photos yet</p>
            <p className="text-slate-400 text-xs mt-1">Tap the camera button to take the first shot!</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
            {photos.map(photo => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                canDelete={!selectMode && (isOrganizer || photo.participant_id === participant.id)}
                onDelete={handleDelete}
                selectable={selectMode}
                selected={selectedIds.has(photo.id)}
                onSelect={id => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-8 py-4 z-30 shadow-lg">
        <div className="flex items-center justify-between max-w-sm mx-auto">
          {/* Download all */}
          <button
            onClick={handleDownloadAll}
            disabled={downloadingAll || photos.length === 0}
            className="flex flex-col items-center gap-1 disabled:opacity-40 text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <span className="text-2xl">⬇️</span>
            <span className="text-[10px] font-medium">
              {downloadingAll ? `${downloadProgress.done}/${downloadProgress.total}` : 'Save All'}
            </span>
          </button>

          {/* Camera */}
          <button
            onClick={() => event?.is_locked ? showToast('🔒 Event is locked — no new photos') : setShowCamera(true)}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform ${event?.is_locked ? 'bg-slate-300 shadow-slate-200' : 'bg-indigo-600 shadow-indigo-300 hover:bg-indigo-700'}`}
          >
            <span className="text-2xl">{event?.is_locked ? '🔒' : '📸'}</span>
          </button>

          {/* Auto-save */}
          <button
            onClick={() => toggleAutoSave(!autoSave)}
            className="flex flex-col items-center gap-1"
          >
            <span className="text-2xl">{autoSave ? '💾' : '📥'}</span>
            <span className={`text-[10px] font-medium ${autoSave ? 'text-green-600' : 'text-slate-400'}`}>
              {autoSave ? 'Auto ON' : 'Auto-save'}
            </span>
          </button>
        </div>
      </div>

      {/* Camera */}
      {showCamera && <Camera onCapture={handleCapturedPhoto} onClose={() => setShowCamera(false)} uploading={uploading} />}

      {/* Select mode bar */}
      {selectMode && (
        <div className="fixed bottom-24 left-0 right-0 z-30 flex justify-center px-4">
          <div className="bg-slate-900 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl">
            <span className="text-white text-sm font-semibold">{selectedIds.size} selected</span>
            <button
              onClick={handleDownloadSelected}
              disabled={selectedIds.size === 0}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 hover:bg-indigo-700 transition-colors"
            >
              ⬇ Download
            </button>
            <button
              onClick={() => setSelectedIds(new Set(photos.map(p => p.id)))}
              className="bg-zinc-700 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-zinc-600 transition-colors"
            >
              All
            </button>
            <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }} className="text-zinc-400 text-xs">Cancel</button>
          </div>
        </div>
      )}

      {/* People / Leaderboard Sheet */}
      {showPeople && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end" onClick={() => setShowPeople(false)}>
          <div className="w-full bg-white rounded-t-3xl p-6 border-t border-slate-200 shadow-2xl max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-5" />
            <h2 className="text-slate-900 font-bold text-xl mb-1">Who&apos;s Here</h2>
            <p className="text-slate-400 text-xs mb-4">{approvedList.length} people · leaderboard by photos</p>
            <div className="overflow-y-auto flex flex-col gap-2">
              {approvedList
                .map(p => ({ ...p, count: photos.filter(ph => ph.participant_name === p.name).length }))
                .sort((a, b) => b.count - a.count)
                .map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                      ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-orange-300 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {i + 1}
                    </span>
                    <p className="flex-1 text-slate-900 text-sm font-medium">
                      {p.name} {p.id === participant?.id ? '(you)' : ''}
                    </p>
                    <div className="text-right">
                      <p className="text-indigo-600 font-bold text-sm">{p.count}</p>
                      <p className="text-slate-400 text-xs">photos</p>
                    </div>
                  </div>
                ))}
            </div>
            <button onClick={() => setShowPeople(false)} className="mt-4 w-full bg-indigo-600 text-white py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition-colors shrink-0">Done</button>
          </div>
        </div>
      )}

      {/* Filter picker */}
      {pendingBlob && (
        <FilterPicker
          blob={pendingBlob}
          onConfirm={handleFilterConfirm}
          onDiscard={() => { setPendingBlob(null); setCaption('') }}
        />
      )}

      {/* Caption modal */}
      {filteredBlob && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-6">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-5" />
            <h3 className="text-slate-900 font-bold text-lg mb-1">Add a caption</h3>
            <p className="text-slate-400 text-xs mb-4">Optional — share what's happening in this photo</p>
            <input
              className="w-full bg-slate-50 text-slate-900 rounded-xl px-4 py-3 text-sm outline-none border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 transition mb-4"
              placeholder="e.g. First dance! 💃"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              autoFocus
              maxLength={120}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setFilteredBlob(null); setCaption('') }}
                className="flex-1 bg-slate-100 text-slate-600 py-3.5 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleUploadWithCaption}
                className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200"
              >
                Share Photo 📸
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Sheet */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end" onClick={() => setShowSettings(false)}>
          <div className="w-full bg-white rounded-t-3xl p-6 border-t border-slate-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-6" />
            <h2 className="text-slate-900 font-bold text-xl mb-6">Settings</h2>

            <div className="flex items-center justify-between py-4 border-b border-slate-100">
              <div>
                <p className="text-slate-900 text-sm font-semibold">Auto-Save Photos</p>
                <p className="text-slate-500 text-xs mt-0.5">New group photos auto-download to your gallery</p>
              </div>
              <button
                onClick={() => toggleAutoSave(!autoSave)}
                className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${autoSave ? 'bg-green-500' : 'bg-slate-200'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${autoSave ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="py-4 border-b border-slate-100">
              <p className="text-slate-400 text-xs mb-1">Your name</p>
              <p className="text-slate-900 text-sm font-medium">{participant.name} {isOrganizer ? '👑 (organizer)' : ''}</p>
            </div>

            <div className="py-4 border-b border-slate-100">
              <p className="text-slate-400 text-xs mb-1">Event code</p>
              <p className="text-indigo-600 font-mono text-2xl font-bold tracking-widest">{code}</p>
            </div>

            {event?.expires_at && (
              <div className="py-4">
                <p className="text-slate-400 text-xs mb-1">Event expires</p>
                <p className="text-slate-900 text-sm">{new Date(event.expires_at).toLocaleString()}</p>
              </div>
            )}

            <button onClick={() => setShowSettings(false)} className="w-full mt-4 bg-indigo-600 text-white py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition-colors">Done</button>
          </div>
        </div>
      )}

      {/* Share Sheet */}
      {showShare && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end" onClick={() => setShowShare(false)}>
          <div className="w-full bg-white rounded-t-3xl p-6 border-t border-slate-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-6" />
            <h2 className="text-slate-900 font-bold text-xl mb-1">Invite Friends</h2>
            <p className="text-slate-500 text-sm mb-6">Share the code or scan the QR</p>

            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : ''}/join/${code}`)}`}
                  alt="QR Code"
                  width={180}
                  height={180}
                  className="rounded"
                />
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-xs mb-1">Event Code</p>
                <p className="text-indigo-600 font-mono text-4xl font-black tracking-widest">{code}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/join/${code}`); showToast('Link copied!') }}
                className="flex-1 bg-slate-100 text-slate-700 py-3.5 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors"
              >
                📋 Copy Link
              </button>
              <button onClick={handleShare} className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200">
                Share ↗
              </button>
            </div>

            <button onClick={() => setShowShare(false)} className="w-full mt-3 bg-slate-100 text-slate-700 py-3.5 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
