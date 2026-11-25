"use client"

import type { EditorDecision } from "@/lib/editor/types"
import type { TimelineSegment } from "@/lib/timeline/types"
import { useEffect, useRef } from "react"

/** Procedural waveform from KEEP / cut density (no audio peaks API yet). */
export function SynthWaveform({
  durationMs,
  segments,
  decisions,
  className,
}: {
  durationMs: number
  segments: TimelineSegment[]
  decisions: EditorDecision[]
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || durationMs <= 0) return

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = window.devicePixelRatio || 1
      const width = parent.clientWidth
      const height = parent.clientHeight
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      draw(canvas, durationMs, segments, decisions, dpr)
    }

    resize()
    const observer = new ResizeObserver(resize)
    if (canvas.parentElement) observer.observe(canvas.parentElement)
    return () => observer.disconnect()
  }, [durationMs, segments, decisions])

  return <canvas ref={canvasRef} className={className} aria-hidden />
}

function isKept(segments: TimelineSegment[], t: number) {
  for (const s of segments) {
    if (t >= s.sourceStartMs && t < s.sourceEndMs) return true
  }
  return false
}

function cutWeight(decisions: EditorDecision[], t: number) {
  let w = 0
  for (const d of decisions) {
    if (t >= d.sourceStartMs && t < d.sourceEndMs) {
      w = Math.max(w, d.effectiveAction === "remove" ? 1 : 0.55)
    }
  }
  return w
}

function draw(
  canvas: HTMLCanvasElement,
  durationMs: number,
  segments: TimelineSegment[],
  decisions: EditorDecision[],
  dpr: number
) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const mid = h / 2
  const bars = Math.min(420, Math.floor(w / (2 * dpr)))
  const step = durationMs / bars

  for (let i = 0; i < bars; i++) {
    const t = i * step
    const kept = isKept(segments, t)
    const cut = cutWeight(decisions, t)
    const seed = Math.sin(i * 12.9898) * 43758.5453
    const noise = seed - Math.floor(seed)
    const base = kept ? 0.35 + noise * 0.55 : 0.08 + noise * 0.12
    const amp = mid * base * (1 - cut * 0.35)
    const x = (i / bars) * w
    const barW = Math.max(dpr, (w / bars) * 0.7)

    const grad = ctx.createLinearGradient(0, mid - amp, 0, mid + amp)
    if (cut > 0.7) {
      grad.addColorStop(0, "#ff4d9a")
      grad.addColorStop(1, "#ff4d9a66")
    } else if (kept) {
      grad.addColorStop(0, "#b8ff3c")
      grad.addColorStop(0.5, "#5ce1ff")
      grad.addColorStop(1, "#ff4d9a88")
    } else {
      grad.addColorStop(0, "#3a4154")
      grad.addColorStop(1, "#232733")
    }

    ctx.fillStyle = grad
    ctx.fillRect(x, mid - amp, barW, amp * 2)
  }
}
