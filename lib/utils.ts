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

export async function downloadPhoto(url: string, filename: string) {
  const res = await fetch(url)
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

export async function downloadAllAsZip(
  photos: { url: string; participant_name: string; created_at: string }[],
  eventTitle: string
) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const folder = zip.folder(eventTitle) || zip

  await Promise.all(
    photos.map(async (photo, i) => {
      try {
        const res = await fetch(photo.url)
        const blob = await res.blob()
        const name = `${String(i + 1).padStart(3, '0')}_${photo.participant_name.replace(/\s+/g, '_')}.jpg`
        folder.file(name, blob)
      } catch (_) {}
    })
  )

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${eventTitle.replace(/\s+/g, '_')}_photos.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

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
