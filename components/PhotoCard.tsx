'use client'
import { useState } from 'react'
import { Photo } from '@/lib/supabase'
import { downloadPhoto } from '@/lib/utils'

interface PhotoCardProps {
  photo: Photo
  canDelete?: boolean
  onDelete?: (id: string) => void
}

export default function PhotoCard({ photo, canDelete, onDelete }: PhotoCardProps) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const filename = `partysnap_${photo.participant_name.replace(/\s+/g, '_')}_${Date.now()}.jpg`

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation()
    setDownloading(true)
    await downloadPhoto(photo.url, filename)
    setDownloading(false)
  }

  return (
    <>
      {/* Thumbnail */}
      <div
        className="relative group cursor-pointer overflow-hidden rounded-xl bg-zinc-900 aspect-square"
        onClick={() => setOpen(true)}
      >
        <img
          src={photo.url}
          alt={`by ${photo.participant_name}`}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
          <span className="text-white text-xs font-medium truncate">{photo.participant_name}</span>
        </div>
        {/* Download button on thumbnail */}
        <button
          onClick={handleDownload}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs hover:bg-black"
        >
          ↓
        </button>
      </div>

      {/* Full screen modal */}
      {open && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex flex-col"
          onClick={() => setOpen(false)}
        >
          <div className="flex items-center justify-between p-4" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-white font-semibold text-sm">{photo.participant_name}</p>
              <p className="text-zinc-500 text-xs">{new Date(photo.created_at).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="bg-white text-black px-4 py-2 rounded-full text-sm font-semibold hover:bg-zinc-200 disabled:opacity-50 flex items-center gap-1"
              >
                {downloading ? '...' : '⬇ Save'}
              </button>
              {canDelete && onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(photo.id) }}
                  className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-red-700"
                >
                  Delete
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-full bg-zinc-800 text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
            <img
              src={photo.url}
              alt={`by ${photo.participant_name}`}
              className="max-w-full max-h-full object-contain rounded-xl"
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  )
}
