'use client'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

type Step = {
  label: string
  sub: string
  tags: string[]
}

const STEPS: Step[] = [
  {
    label: 'Create Event',
    sub: 'Add a title & your name, pick an expiry time — that’s it.',
    tags: ['⏱️ Takes 10s', '🔒 No signup'],
  },
  {
    label: 'Share the Code',
    sub: 'A unique 6-char code & QR are generated instantly.',
    tags: ['🔢 6-char code', '📱 Scan QR'],
  },
  {
    label: 'Friends Join',
    sub: 'They open the link, enter a name — you approve them.',
    tags: ['✅ You approve', '🙅 No app install'],
  },
  {
    label: 'Snap Photos',
    sub: 'Everyone shoots. The gallery fills up live for all.',
    tags: ['⚡ Real-time', '👥 Everyone shoots'],
  },
  {
    label: 'Save Everything',
    sub: 'Photos auto-share to everyone & download in one tap.',
    tags: ['📥 Auto-download to all', '🤝 Shared with everyone', '💾 One-tap save'],
  },
]

// Drop real screenshots into /public/flow (step1.png … step5.png) and list them
// here to replace the mockups automatically, e.g. ['/flow/step1.png', …].
const STEP_IMAGES: (string | null)[] = [null, null, null, null, null]

const STORAGE_KEY = 'snaprain_tour_seen'

const TILES = [
  'bg-rose-300', 'bg-amber-300', 'bg-sky-300',
  'bg-emerald-300', 'bg-violet-300', 'bg-orange-300',
  'bg-pink-300', 'bg-teal-300', 'bg-indigo-300',
]

const QR_DOTS: [number, number][] = [
  [9, 1], [11, 2], [8, 4], [10, 5], [12, 3], [9, 8], [11, 9], [8, 11], [10, 12],
  [9, 15], [11, 16], [8, 18], [10, 19], [14, 9], [16, 11], [18, 14], [15, 16],
  [17, 18], [3, 9], [5, 11], [2, 13], [4, 16], [6, 18], [13, 10], [12, 13],
]

function Qr() {
  return (
    <svg viewBox="0 0 21 21" className="h-9 w-9" aria-hidden="true">
      <rect width="21" height="21" fill="#ffffff" />
      {([[0, 0], [14, 0], [0, 14]] as [number, number][]).map(([x, y], k) => (
        <g key={k}>
          <rect x={x} y={y} width="7" height="7" fill="#1e293b" />
          <rect x={x + 1} y={y + 1} width="5" height="5" fill="#ffffff" />
          <rect x={x + 2} y={y + 2} width="3" height="3" fill="#1e293b" />
        </g>
      ))}
      {QR_DOTS.map(([x, y], k) => (
        <rect key={k} x={x} y={y} width="1" height="1" fill="#1e293b" />
      ))}
    </svg>
  )
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-[1.1rem] border-[3px] border-slate-800 bg-slate-800 p-0.5 shadow-xl shadow-slate-300">
      <div className="absolute left-1/2 top-[3px] z-10 h-1 w-7 -translate-x-1/2 rounded-full bg-slate-800" />
      <div className="aspect-[9/19] overflow-hidden rounded-[0.9rem] bg-white">{children}</div>
    </div>
  )
}

function Gallery({ withSaveBar }: { withSaveBar: boolean }) {
  return (
    <div className="relative flex h-full flex-col bg-slate-50">
      {withSaveBar && (
        <div className="absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-full bg-indigo-600 px-2 py-0.5 text-[6px] font-semibold text-white shadow">
          ✅ 12 saved!
        </div>
      )}
      <div className="border-b border-slate-200 bg-white px-2 py-1">
        <div className="text-[7px] font-bold text-slate-800">Beach Trip 🏖️</div>
        <div className="text-[6px] text-slate-400">5 people · 12 photos</div>
      </div>
      <div className="grid flex-1 grid-cols-3 content-start gap-px p-0.5">
        {TILES.map((t, k) => (
          <div key={k} className={`aspect-square rounded-sm ${t}`} />
        ))}
      </div>
      {withSaveBar ? (
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-2 py-1">
          <div className="flex flex-col items-center rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600 ring-1 ring-indigo-300">
            <span className="text-[10px] leading-none">⬇️</span>
            <span className="text-[5px] font-bold">Save All</span>
          </div>
          <div className="grid h-6 w-6 place-items-center rounded-full bg-indigo-600 text-[11px] shadow">📸</div>
          <div className="flex flex-col items-center text-green-600">
            <span className="text-[10px] leading-none">💾</span>
            <span className="text-[5px] font-bold">Auto</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center border-t border-slate-200 bg-white py-1.5">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-indigo-600 text-[12px] shadow-md shadow-indigo-300">📸</div>
        </div>
      )}
    </div>
  )
}

function Screen({ index }: { index: number }) {
  switch (index) {
    case 0: // Create Event — the home form
      return (
        <div className="flex h-full flex-col gap-1.5 bg-slate-50 p-2">
          <div className="flex items-center gap-2 pb-0.5 text-[7px] font-bold">
            <span className="border-b-2 border-indigo-600 pb-0.5 text-indigo-600">Create</span>
            <span className="text-slate-300">Join</span>
          </div>
          <span className="text-[6px] text-slate-400">Event Name</span>
          <div className="h-3.5 rounded border border-slate-200 bg-white" />
          <span className="text-[6px] text-slate-400">Your Name</span>
          <div className="h-3.5 rounded border border-slate-200 bg-white" />
          <span className="text-[6px] text-slate-400">Expires</span>
          <div className="h-3.5 rounded border border-slate-200 bg-white" />
          <div className="mt-auto grid h-5 place-items-center rounded-md bg-indigo-600 text-[7px] font-bold text-white">
            Create Event ✨
          </div>
        </div>
      )
    case 1: // Share the Code — QR + code
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-white p-2">
          <div className="rounded border border-slate-200 p-1.5">
            <Qr />
          </div>
          <span className="text-[6px] text-slate-400">Event Code</span>
          <span className="font-mono text-[13px] font-black tracking-widest text-indigo-600">ABC123</span>
          <div className="flex w-full gap-1.5">
            <div className="grid h-4 flex-1 place-items-center rounded bg-slate-100 text-[6px] font-semibold text-slate-500">Copy</div>
            <div className="grid h-4 flex-1 place-items-center rounded bg-indigo-600 text-[6px] font-semibold text-white">Share ↗</div>
          </div>
        </div>
      )
    case 2: // Friends Join — invite screen
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-gradient-to-b from-slate-50 to-indigo-50 p-2 text-center">
          <div className="grid h-6 w-6 place-items-center rounded-lg bg-indigo-600 text-[12px] shadow">🎉</div>
          <span className="text-[8px] font-bold text-slate-800">You&apos;re invited!</span>
          <span className="text-[7px] font-semibold text-indigo-600">Beach Trip 🏖️</span>
          <span className="mt-1 self-start text-[6px] text-slate-400">Enter your name</span>
          <div className="h-3.5 w-full rounded border border-slate-200 bg-white" />
          <div className="mt-0.5 grid h-5 w-full place-items-center rounded-md bg-indigo-600 text-[7px] font-bold text-white">
            Request to Join 📸
          </div>
        </div>
      )
    case 3: // Snap Photos — live gallery + camera
      return <Gallery withSaveBar={false} />
    case 4: // Save Everything — gallery + Save All highlighted
      return <Gallery withSaveBar />
    default:
      return null
  }
}

function Milestone({ index }: { index: number }) {
  const img = STEP_IMAGES[index]
  return (
    <PhoneFrame>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={`${STEPS[index].label} screen`} className="h-full w-full object-cover" />
      ) : (
        <Screen index={index} />
      )}
    </PhoneFrame>
  )
}

export default function HowItWorks() {
  const [open, setOpen] = useState(false)
  const [slide, setSlide] = useState(0)

  const last = STEPS.length - 1

  // First visit → auto-start the tour. Once seen/skipped it won't auto-open again.
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setSlide(0)
        setOpen(true)
      }
    } catch {
      /* localStorage unavailable — tour just won't auto-open */
    }
  }, [])

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])

  const openTour = useCallback(() => {
    setSlide(0)
    setOpen(true)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    markSeen()
  }, [markSeen])

  const next = useCallback(() => setSlide((s) => Math.min(s + 1, last)), [last])
  const prev = useCallback(() => setSlide((s) => Math.max(s - 1, 0)), [])

  // Keyboard navigation while the tour is open
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, next, prev])

  const step = STEPS[slide]

  return (
    <div className="w-full max-w-sm mb-4 flex flex-col items-center">
      {/* Reopenable "How It Works" button (tour also auto-opens on first visit) */}
      <button
        onClick={openTour}
        className="group inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 shadow-sm transition-all hover:border-indigo-300 hover:text-indigo-600"
      >
        <span className="text-[11px]">📖</span>
        How It Works
        <span className="text-indigo-400 transition-transform group-hover:translate-x-0.5">→</span>
      </button>

      {/* Slideshow tour modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="How SnapRain works"
          onClick={close}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* top bar */}
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Step {slide + 1} of {STEPS.length}</span>
              <button
                onClick={close}
                className="text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
              >
                Skip ✕
              </button>
            </div>

            {/* phone mockup of the real screen */}
            <div className="mx-auto w-32">
              <Milestone index={slide} />
            </div>

            {/* label + sub */}
            <div className="mt-4 text-center">
              <h3 className="text-lg font-black tracking-tight text-slate-900">{step.label}</h3>
              <p className="mx-auto mt-1 max-w-[16rem] text-sm leading-snug text-slate-500">{step.sub}</p>
            </div>

            {/* feature tags */}
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {step.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-600"
                >
                  {t}
                </span>
              ))}
            </div>

            {/* progress dots */}
            <div className="mt-5 flex justify-center gap-1.5">
              {STEPS.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => setSlide(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-5 bg-indigo-600' : 'w-1.5 bg-slate-200 hover:bg-slate-300'}`}
                />
              ))}
            </div>

            {/* nav */}
            <div className="mt-4 flex gap-3">
              <button
                onClick={prev}
                disabled={slide === 0}
                className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-40"
              >
                Back
              </button>
              {slide < last ? (
                <button
                  onClick={next}
                  className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-colors hover:bg-indigo-700"
                >
                  Next →
                </button>
              ) : (
                <button
                  onClick={close}
                  className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-colors hover:bg-indigo-700"
                >
                  Let&apos;s go 🎉
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
