'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { captureFromVideo, compressImage } from '@/lib/utils'

interface CameraProps {
  onCapture: (blob: Blob) => void
  onClose: () => void
  uploading: boolean
}

export default function Camera({ onCapture, onClose, uploading }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [flash, setFlash] = useState(false)
  const [lastPhoto, setLastPhoto] = useState<string | null>(null)
  const [error, setError] = useState('')

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
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
      setError('')
    } catch (err) {
      setError('Camera access denied. Please allow camera permission.')
      console.error(err)
    }
  }, [])

  useEffect(() => {
    startCamera(facingMode)
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [facingMode, startCamera])

  async function handleCapture() {
    if (!videoRef.current || uploading) return
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

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Flash overlay */}
      {flash && <div className="absolute inset-0 bg-white z-10 pointer-events-none" />}

      {/* Video */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
            <p className="text-white bg-zinc-900/80 rounded-2xl p-6 text-sm">{error}</p>
          </div>
        )}
        {uploading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-4 py-2 rounded-full flex items-center gap-2">
            <span className="animate-spin">⏳</span> Sharing...
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black px-8 py-6 flex items-center justify-between safe-area-pb">
        {/* Close */}
        <button
          onClick={onClose}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-zinc-800 text-white text-xl"
        >
          ✕
        </button>

        {/* Shutter */}
        <button
          onClick={handleCapture}
          disabled={uploading}
          className="w-20 h-20 rounded-full bg-white border-4 border-zinc-400 flex items-center justify-center disabled:opacity-60 active:scale-95 transition-transform"
        >
          {lastPhoto ? (
            <img src={lastPhoto} alt="last" className="w-full h-full rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-white" />
          )}
        </button>

        {/* Flip camera */}
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
