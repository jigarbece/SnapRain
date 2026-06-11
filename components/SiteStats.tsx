'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const VISIT_FLAG = 'snaprain_visit_counted'

// Reliable exact row count via a HEAD request reading the Content-Range header.
// (supabase-js head:true count returns null with the publishable key here.)
async function tableCount(table: string): Promise<number | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || url.includes('placeholder')) return null
  try {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      method: 'HEAD',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    })
    const range = res.headers.get('content-range') // "0-4/5" or "*/0"
    if (!range) return null
    const total = range.split('/')[1]
    return total === '*' ? 0 : Number(total)
  } catch {
    return null
  }
}

// Smoothly counts from 0 → target; honors reduced-motion.
function useCountUp(target: number | null, duration = 900) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target == null) return
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

function Stat({ emoji, value, label }: { emoji: string; value: number | null; label: string }) {
  const shown = useCountUp(value)
  return (
    <div className="flex flex-col items-center px-2 py-3">
      <span className="text-base leading-none">{emoji}</span>
      <span className="mt-1 text-lg font-black tabular-nums text-slate-900">
        {value == null ? '—' : shown.toLocaleString()}
      </span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
    </div>
  )
}

export default function SiteStats() {
  const [events, setEvents] = useState<number | null>(null)
  const [photos, setPhotos] = useState<number | null>(null)
  const [visits, setVisits] = useState<number | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Events + photos counts (read-only; work with the anon key)
      const [ev, ph] = await Promise.all([tableCount('events'), tableCount('photos')])
      if (ev == null && ph == null) {
        // Backend not reachable (e.g. missing env) — hide the whole bar
        if (!cancelled) setHidden(true)
        return
      }
      if (!cancelled) {
        setEvents(ev ?? 0)
        setPhotos(ph ?? 0)
      }

      // Site visits — counted once per browser session (needs the SQL function)
      try {
        let v: number
        if (!sessionStorage.getItem(VISIT_FLAG)) {
          const { data, error } = await supabase.rpc('increment_site_visits')
          if (error) throw error
          v = Number(data) || 0
          sessionStorage.setItem(VISIT_FLAG, '1')
        } else {
          const { data, error } = await supabase.from('site_stats').select('visits').eq('id', 1).single()
          if (error) throw error
          v = Number(data?.visits) || 0
        }
        if (!cancelled) setVisits(v)
      } catch {
        // increment_site_visits / site_stats not set up yet → leave visits as —
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (hidden) return null

  return (
    <div className="mt-8 w-full max-w-sm">
      <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white/70 shadow-sm backdrop-blur">
        <Stat emoji="🎉" value={events} label="Events" />
        <Stat emoji="👀" value={visits} label="Visits" />
        <Stat emoji="📸" value={photos} label="Photos" />
      </div>
    </div>
  )
}
