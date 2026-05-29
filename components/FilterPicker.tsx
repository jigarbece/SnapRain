'use client'
import { useEffect, useRef, useState } from 'react'

export type FilterName = 'none' | 'bw' | 'vintage' | 'warm' | 'cool' | 'fade' | 'vivid'

export const FILTERS: { name: FilterName; label: string; css: string }[] = [
  { name: 'none',    label: 'Original', css: 'none' },
  { name: 'bw',      label: 'B&W',      css: 'grayscale(100%)' },
  { name: 'vintage', label: 'Vintage',  css: 'sepia(60%) contrast(90%) brightness(90%)' },
  { name: 'warm',    label: 'Warm',     css: 'saturate(130%) hue-rotate(-15deg) brightness(105%)' },
  { name: 'cool',    label: 'Cool',     css: 'saturate(110%) hue-rotate(20deg) brightness(105%)' },
  { name: 'fade',    label: 'Fade',     css: 'contrast(80%) brightness(110%) saturate(80%)' },
  { name: 'vivid',   label: 'Vivid',    css: 'saturate(180%) contrast(110%)' },
]

interface FilterPickerProps {
  blob: Blob
  onConfirm: (filteredBlob: Blob, filter: FilterName) => void
  onDiscard: () => void
}

export default function FilterPicker({ blob, onConfirm, onDiscard }: FilterPickerProps) {
  const [selected, setSelected] = useState<FilterName>('none')
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [applying, setApplying] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const objectUrl = useRef<string>('')

  useEffect(() => {
    objectUrl.current = URL.createObjectURL(blob)
    // Pre-render tiny previews for each filter
    const img = new Image()
    img.onload = () => {
      const map: Record<string, string> = {}
      FILTERS.forEach(f => {
        const canvas = document.createElement('canvas')
        const size = 80
        canvas.width = size; canvas.height = size
        const ctx = canvas.getContext('2d')!
        ctx.filter = f.css === 'none' ? '' : f.css
        // crop square from center
        const s = Math.min(img.width, img.height)
        const sx = (img.width - s) / 2
        const sy = (img.height - s) / 2
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size)
        map[f.name] = canvas.toDataURL('image/jpeg', 0.7)
      })
      setPreviews(map)
    }
    img.src = objectUrl.current
    return () => URL.revokeObjectURL(objectUrl.current)
  }, [blob])

  async function handleConfirm() {
    setApplying(true)
    const filter = FILTERS.find(f => f.name === selected)!
    if (filter.name === 'none') {
      onConfirm(blob, selected)
      return
    }
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width; canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.filter = filter.css
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(b => {
        setApplying(false)
        onConfirm(b!, selected)
      }, 'image/jpeg', 0.92)
    }
    img.src = objectUrl.current
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Preview */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <img
          ref={imgRef}
          src={objectUrl.current}
          alt="preview"
          className="max-w-full max-h-full object-contain transition-all duration-200"
          style={{ filter: FILTERS.find(f => f.name === selected)?.css === 'none' ? undefined : FILTERS.find(f => f.name === selected)?.css }}
        />
      </div>

      {/* Filter strip */}
      <div className="bg-black px-4 py-3">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button
              key={f.name}
              onClick={() => setSelected(f.name)}
              className="flex flex-col items-center gap-1.5 shrink-0"
            >
              <div className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${selected === f.name ? 'border-white scale-105' : 'border-transparent opacity-70'}`}>
                {previews[f.name]
                  ? <img src={previews[f.name]} alt={f.label} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-zinc-800 animate-pulse" />
                }
              </div>
              <span className={`text-xs font-medium ${selected === f.name ? 'text-white' : 'text-zinc-500'}`}>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-black px-6 pb-8 pt-3 flex gap-3">
        <button onClick={onDiscard} className="flex-1 bg-zinc-800 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-zinc-700 transition-colors">
          Discard
        </button>
        <button onClick={handleConfirm} disabled={applying} className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md shadow-indigo-900">
          {applying ? 'Applying...' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
