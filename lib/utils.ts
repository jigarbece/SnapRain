export function generateCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function compressImage(blob: Blob, maxWidth = 1920, quality = 0.85): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality)
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

export async function captureFromVideo(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(video, 0, 0)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.92))
}

// ─── Save a single photo to gallery (or fallback download) ────────────────────
export async function savePhotoToGallery(url: string, filename: string): Promise<void> {
  const res = await fetch(url)
  const blob = await res.blob()
  const file = new File([blob], filename, { type: 'image/jpeg' })

  // Web Share API with files — on iOS shows "Save Image" option, on Android saves to gallery
  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({ files: [file], title: 'SnapRain Photo' })
    return
  }

  // Fallback for desktop / unsupported browsers — regular download
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

// ─── Save all photos one by one ───────────────────────────────────────────────
export async function downloadAllOneByOne(
  photos: { url: string; participant_name: string; created_at: string }[],
  onProgress?: (done: number, total: number) => void
) {
  const canShare =
    typeof navigator !== 'undefined' &&
    !!navigator.share &&
    !!navigator.canShare

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    const filename = `snaprain_${String(i + 1).padStart(3, '0')}_${photo.participant_name.replace(/\s+/g, '_')}.jpg`
    try {
      const res = await fetch(photo.url)
      const blob = await res.blob()

      if (canShare) {
        const file = new File([blob], filename, { type: 'image/jpeg' })
        if (navigator.canShare({ files: [file] })) {
          // On mobile: shows native share sheet → Save Image → Gallery
          await navigator.share({ files: [file], title: 'SnapRain Photo' })
          onProgress?.(i + 1, photos.length)
          // Wait for user to dismiss share sheet before showing next
          await new Promise(r => setTimeout(r, 800))
          continue
        }
      }

      // Desktop fallback: trigger download
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      onProgress?.(i + 1, photos.length)
      await new Promise(r => setTimeout(r, 400))
    } catch (_) {
      // User cancelled share sheet — still count as progress
      onProgress?.(i + 1, photos.length)
    }
  }
}

// ─── Auto-save a photo silently (no share sheet — works outside user gesture) ──
export async function autoSavePhoto(url: string): Promise<void> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const filename = `snaprain_autosave_${Date.now()}.jpg`
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch (_) {}
}

// Keep old name as alias for single photo download (used in PhotoCard)
export const downloadPhoto = savePhotoToGallery

// ─── localStorage helpers ─────────────────────────────────────────────────────
export function getParticipant(code: string): { id: string; name: string } | null {
  try {
    const raw = localStorage.getItem(`ps_participant_${code}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveParticipant(code: string, data: { id: string; name: string }) {
  localStorage.setItem(`ps_participant_${code}`, JSON.stringify(data))
}

export function getOrganizerKey(code: string): string | null {
  return localStorage.getItem(`ps_org_${code}`)
}

export function saveOrganizerKey(code: string, key: string) {
  localStorage.setItem(`ps_org_${code}`, key)
}

export function getAutoSave(code: string): boolean {
  return localStorage.getItem(`ps_autosave_${code}`) === 'true'
}

export function setAutoSave(code: string, val: boolean) {
  localStorage.setItem(`ps_autosave_${code}`, val ? 'true' : 'false')
}
