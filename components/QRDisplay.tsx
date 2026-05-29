'use client'
import { useEffect, useRef } from 'react'

interface QRDisplayProps {
  value: string
  size?: number
}

export default function QRDisplay({ value, size = 200 }: QRDisplayProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = ''
    import('qrcode.react').then(({ QRCodeSVG }) => {
      const { createRoot } = require('react-dom/client')
      const root = createRoot(ref.current!)
      root.render(
        // @ts-ignore
        <QRCodeSVG value={value} size={size} bgColor="#ffffff" fgColor="#000000" level="M" />
      )
    })
  }, [value, size])

  return <div ref={ref} className="bg-white p-3 rounded-2xl inline-block" />
}
