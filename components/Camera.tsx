'use client'
import { useRef, useEffect } from 'react'

interface CameraProps {
  onCapture: (blob: Blob) => void
  onClose: () => void
  uploading: boolean
}

export default function Camera({ onCapture, onClose, uploading }: CameraProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Auto-open native camera on mount
    inputRef.current?.click()
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) { onClose(); return }
    onCapture(file)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />

      {/* Show uploading overlay while photo is being sent */}
      {uploading && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-white font-semibold text-sm">Sharing photo...</p>
        </div>
      )}
    </>
  )
}
