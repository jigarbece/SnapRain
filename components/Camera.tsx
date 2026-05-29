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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }

    // Check if mediaDevices is available at all
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermission('unavailable')
      return
    }

    setPermission('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setPermission('granted')
    } catch (err: unknown) {
      const error = err as { name?: string }
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermission('denied')
      } else {
        setPermission('unavailable')
      }
      console.error(err)
    }
  }, [])

  useEffect(() => {
    startCamera(facingMode)
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [facingMode, startCamera])

  async function handleCapture() {
    if (!videoRef.current || uploading || permission !== 'granted') return
    setFlash(true)
    setTimeout(() => setFlash(false), 150)
    const raw = await captureFromVideo(videoRef.current)
    const compressed = await compressImage(raw)
    const preview = URL.createObjectURL(compressed)
    setLastPhoto(preview)
    onCapture(compressed)
  }

  function flipCamera() {
    setFacingMode(f => f === 'environment' ? 'user' : 'environment')
  }

  // ── Permission denied screen ──────────────────────────────────────────────
  if (permission === 'denied') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-6">🚫</div>
        <h2 className="text-white text-xl font-bold mb-3">Camera Access Blocked</h2>
        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
          Your browser has blocked camera access for this site. You need to allow it manually.
        </p>

        {/* Step by step instructions */}
        <div className="bg-zinc-900 rounded-2xl p-5 text-left w-full max-w-sm mb-6 border border-zinc-800">
          <p className="text-zinc-300 text-xs font-semibold mb-3 uppercase tracking-wider">How to fix in Chrome</p>
          <div className="flex flex-col gap-3">
            {[
              { step: '1', text: 'Click the 🔒 lock icon in the address bar' },
              { step: '2', text: 'Find "Camera" and set it to Allow' },
              { step: '3', text: 'Refresh the page and tap camera again' },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-zinc-700 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">{step}</span>
                <p className="text-zinc-300 text-sm">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 w-full max-w-sm">
          <button
            onClick={() => startCamera(facingMode)}
            className="flex-1 bg-white text-black py-3.5 rounded-xl font-semibold text-sm"
          >
            Try Again
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-zinc-800 text-white py-3.5 rounded-xl font-semibold text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  // ── Unavailable screen ────────────────────────────────────────────────────
  if (permission === 'unavailable') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-6">📵</div>
        <h2 className="text-white text-xl font-bold mb-3">Camera Not Available</h2>
        <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
          Camera is not available on this device or browser. Try opening SnapRain on your phone for the best experience.
        </p>
        <button onClick={onClose} className="bg-zinc-800 text-white px-8 py-3.5 rounded-xl font-semibold text-sm">
          Go Back
        </button>
      </div>
    )
  }

  // ── Requesting screen ─────────────────────────────────────────────────────
  if (permission === 'requesting' || permission === 'idle') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-6 animate-pulse">📷</div>
        <h2 className="text-white text-xl font-bold mb-3">Starting Camera...</h2>
        <p className="text-zinc-400 text-sm mb-2">
          A permission prompt may appear — tap <strong className="text-white">Allow</strong>
        </p>
        <button onClick={onClose} className="mt-8 text-zinc-600 text-sm underline">Cancel</button>
      </div>
    )
  }

  // ── Camera view ───────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {flash && <div className="absolute inset-0 bg-white z-10 pointer-events-none" />}

      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {uploading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-4 py-2 rounded-full flex items-center gap-2">
            <span className="animate-spin inline-block">⏳</span> Sharing with group...
          </div>
        )}
        {/* Viewfinder corners */}
        <div className="absolute inset-8 pointer-events-none">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/40 rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/40 rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/40 rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/40 rounded-br-lg" />
        </div>
      </div>

      <div className="bg-black px-8 py-6 flex items-center justify-between">
        <button
          onClick={onClose}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-zinc-800 text-white text-xl"
        >
          ✕
        </button>

        <button
          onClick={handleCapture}
          disabled={uploading}
          className="w-20 h-20 rounded-full bg-white border-4 border-zinc-400 flex items-center justify-center disabled:opacity-60 active:scale-95 transition-transform overflow-hidden"
        >
          {lastPhoto
            ? <img src={lastPhoto} alt="last" className="w-full h-full object-cover" />
            : <div className="w-16 h-16 rounded-full bg-white" />
          }
        </button>

        <button
          onClick={flipCamera}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-zinc-800 text-white text-xl"
        >
          🔄
        </button>
      </div>
    </div>
  )
}
