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

  const filename = `snaprain_${photo.participant_name.replace(/\s+/g, '_')}_${Date.now()}.jpg`

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation()
    setDownloading(true)
    await downloadPhoto(photo.url, filename)
    setDownloading(false)
  }

  return (
    <>
      {/* Thumbnail */}
      <div className="flex flex-col">
      <div
        className="relative group cursor-pointer overflow-hidden rounded-xl bg-slate-100 aspect-square"
        onClick={() => setOpen(true)}
      >
        <img
          src={photo.url}
          alt={`by ${photo.participant_name}`}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
          <span className="text-white text-xs font-medium truncate">{photo.participant_name}</span>
        </div>
        {/* Download button on thumbnail */}
        <button
          onClick={handleDownload}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 text-slate-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs hover:bg-white shadow-sm"
        >
          ↓
        </button>
      </div>
      {photo.caption && (
        <p className="text-slate-500 text-[10px] px-1 pt-1 truncate italic">"{photo.caption}"</p>
      )}
      </div>

      {/* Full screen modal */}
      {open && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex flex-col"
          onClick={() => setOpen(false)}
        >
          <div className="flex items-center justify-between p-4 bg-white/5 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-white font-semibold text-sm">{photo.participant_name}</p>
              <p className="text-white/50 text-xs">{new Date(photo.created_at).toLocaleString()}</p>
              {photo.caption && <p className="text-white/80 text-xs mt-1 italic">"{photo.caption}"</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="bg-indigo-600 text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1 shadow-md"
              >
                {downloading ? '...' : '⬇ Save'}
              </button>
              {canDelete && onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(photo.id) }}
                  className="bg-red-500 text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-red-600"
                >
                  Delete
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
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
