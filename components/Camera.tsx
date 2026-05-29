'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { captureFromVideo, compressImage } from '@/lib/utils'

interface CameraProps {
  onCapture: (blob: Blob) => void
  onClose: () => void
  uploading: boolean
}

type PermissionState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'

export default function Camera({ onCapture, onClose, uploading }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [flash, setFlash] = useState(false)
  const [lastPhoto, setLastPhoto] = useState<string | null>(null)
  const [permission, setPermission] = useState<PermissionState>('idle')

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission('unavailable')
      return
    }

    setPermission('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream
      setPermission('granted')

      // Attach stream to video after state update renders the video element
      setTimeout(() => {
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        video.muted = true
        video.playsInline = true

        // Wait for metadata then play
        video.onloadedmetadata = () => {
          video.play().catch(() => {
            // Some browsers need a second attempt
            setTimeout(() => video.play().catch(console.error), 200)
          })
        }

        // Fallback: if metadata already loaded
        if (video.readyState >= 2) {
          video.play().catch(console.error)
        }
      }, 100)

    } catch (err: unknown) {
      const error = err as { name?: string }
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermission('denied')
      } else {
        setPermission('unavailable')
      }
    }
  }, [])

  useEffect(() => {
    startCamera(facingMode)
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [facingMode, startCamera])

  async function handleCapture() {
    if (!videoRef.current || uploading || permission !== 'granted') return
    setFlash(true)
    setTimeout(() => setFlash(false), 150)
    const raw = await captureFromVideo(videoRef.current)
    const compressed = await compressImage(raw)
    setLastPhoto(URL.createObjectURL(compressed))
    onCapture(compressed)
  }

  function flipCamera() {
    setFacingMode(f => f === 'environment' ? 'user' : 'environment')
  }

  // ── Screens ───────────────────────────────────────────────────────────────
  if (permission === 'denied') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-6">🚫</div>
        <h2 className="text-white text-xl font-bold mb-3">Camera Access Blocked</h2>
        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">Your browser blocked camera access. Allow it in site settings.</p>
        <div className="bg-zinc-900 rounded-2xl p-5 text-left w-full max-w-sm mb-6 border border-zinc-800">
          <p className="text-zinc-300 text-xs font-semibold mb-3 uppercase tracking-wider">Fix in Chrome</p>
          {[
            'Click the 🔒 lock icon in the address bar',
            'Set Camera → Allow',
            'Refresh the page and try again',
          ].map((text, i) => (
            <div key={i} className="flex items-start gap-3 mb-2">
              <span className="w-5 h-5 rounded-full bg-zinc-700 text-white text-xs flex items-center justify-center shrink-0">{i + 1}</span>
              <p className="text-zinc-300 text-sm">{text}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-3 w-full max-w-sm">
          <button onClick={() => startCamera(facingMode)} className="flex-1 bg-white text-black py-3.5 rounded-xl font-semibold text-sm">Try Again</button>
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-white py-3.5 rounded-xl font-semibold text-sm">Go Back</button>
        </div>
      </div>
    )
  }

  if (permission === 'unavailable') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-6">📵</div>
        <h2 className="text-white text-xl font-bold mb-3">Camera Not Available</h2>
        <p className="text-zinc-400 text-sm mb-6">Try opening SnapRain on your phone for the best experience.</p>
        <button onClick={onClose} className="bg-zinc-800 text-white px-8 py-3.5 rounded-xl font-semibold text-sm">Go Back</button>
      </div>
    )
  }

  if (permission === 'idle' || permission === 'requesting') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-6 animate-pulse">📷</div>
        <h2 className="text-white text-xl font-bold mb-2">Starting Camera...</h2>
        <p className="text-zinc-400 text-sm">Tap <strong className="text-white">Allow</strong> when your browser asks</p>
        <button onClick={onClose} className="mt-10 text-zinc-600 text-sm underline">Cancel</button>
      </div>
    )
  }

  // ── Live camera view ──────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {flash && <div className="absolute inset-0 bg-white z-20 pointer-events-none" />}

      {/* Video fill */}
      <div className="flex-1 relative bg-zinc-900 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />

        {uploading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-4 py-2 rounded-full flex items-center gap-2 z-10">
            <span className="animate-spin inline-block">⏳</span> Sharing...
          </div>
        )}

        {/* Viewfinder */}
        <div className="absolute inset-8 pointer-events-none">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/50 rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/50 rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/50 rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/50 rounded-br-lg" />
        </div>
      </div>

      {/* Controls */}
      <div className="bg-black px-8 py-6 flex items-center justify-between shrink-0">
        <button onClick={onClose} className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-white text-xl">✕</button>

        <button
          onClick={handleCapture}
          disabled={uploading}
          className="w-20 h-20 rounded-full bg-white border-4 border-zinc-400 flex items-center justify-center disabled:opacity-60 active:scale-95 transition-transform overflow-hidden"
        >
          {lastPhoto
            ? <img src={lastPhoto} alt="" className="w-full h-full object-cover" />
            : <div className="w-16 h-16 rounded-full bg-white" />
          }
        </button>

        <button onClick={flipCamera} className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-white text-xl">🔄</button>
      </div>
    </div>
  )
}
