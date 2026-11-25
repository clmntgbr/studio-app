"use client"

import { SynthWaveform } from "@/components/editor/factory/synth-waveform"
import { formatClock } from "@/lib/editor/timeline-mapper"
import type { PlaybackTime } from "@/lib/editor/use-timeline-player"
import type { EditorDecision } from "@/lib/editor/types"
import type { TimelineSegment } from "@/lib/timeline/types"
import { useCallback, useEffect, useRef, useState } from "react"

const MIN_ZOOM = 1
const MAX_ZOOM = 48

function clampZoom(v: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v))
}

function span(startMs: number, endMs: number, durationMs: number) {
  return {
    left: `${(startMs / durationMs) * 100}%`,
    width: `${Math.max(0.15, ((endMs - startMs) / durationMs) * 100)}%`,
  }
}

export function SequenceRail({
  durationMs,
  segments,
  decisions,
  playing,
  subscribe,
  onSeekSource,
  onPreviewDecision,
}: {
  durationMs: number
  segments: TimelineSegment[]
  decisions: EditorDecision[]
  playing: boolean
  subscribe: (listener: (time: PlaybackTime) => void) => () => void
  onSeekSource: (sourceMs: number) => void
  onPreviewDecision: (decision: EditorDecision) => void
}) {
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  const followRef = useRef(playing)
  const userScrolledRef = useRef(false)
  const programmaticScrollRef = useRef(false)
  const scrollLeftRef = useRef(0)
  const playheadRatioRef = useRef(0)

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    followRef.current = playing
    if (playing) userScrolledRef.current = false
  }, [playing])

  useEffect(() => {
    return subscribe(({ sourceMs }) => {
      const playhead = playheadRef.current
      const viewport = viewportRef.current
      const track = trackRef.current
      if (!playhead || !viewport || !track || durationMs <= 0) return
      const ratio = Math.min(1, Math.max(0, sourceMs / durationMs))
      playheadRatioRef.current = ratio
      playhead.style.left = `${ratio * 100}%`

      if (
        !followRef.current ||
        userScrolledRef.current ||
        zoomRef.current <= MIN_ZOOM
      ) {
        return
      }
      const x = ratio * track.offsetWidth
      const viewLeft = viewport.scrollLeft
      const viewWidth = viewport.clientWidth
      const edge = viewWidth * 0.2
      if (x < viewLeft + edge || x > viewLeft + viewWidth - edge) {
        programmaticScrollRef.current = true
        viewport.scrollLeft = Math.max(0, x - viewWidth * 0.35)
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false
        })
      }
    })
  }, [durationMs, subscribe])

  const ratioFromPointer = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

  const applyZoom = useCallback(
    (clientX: number, nextZoom: number) => {
      const sourceRatio = ratioFromPointer(clientX)
      const viewport = viewportRef.current
      const pointerX = viewport
        ? clientX - viewport.getBoundingClientRect().left
        : 0
      zoomRef.current = nextZoom
      setZoom(nextZoom)
      requestAnimationFrame(() => {
        const current = viewportRef.current
        const track = trackRef.current
        if (!current || !track) return
        programmaticScrollRef.current = true
        current.scrollLeft = sourceRatio * track.offsetWidth - pointerX
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false
        })
      })
    },
    [ratioFromPointer]
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY))
        return
      event.preventDefault()
      applyZoom(
        event.clientX,
        clampZoom(zoomRef.current * Math.exp(-event.deltaY * 0.002))
      )
    }
    viewport.addEventListener("wheel", onWheel, { passive: false })
    return () => viewport.removeEventListener("wheel", onWheel)
  }, [applyZoom])

  const cuts = decisions.filter((d) => d.effectiveAction !== "keep")

  return (
    <div className="cf-panel flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-[#232733] px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="cf-label">Sequence</span>
          <span className="text-[11px] text-[#8b93a7]">
            {formatClock(durationMs)} · {segments.length} KEEP · {cuts.length}{" "}
            CUT
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-[#8b93a7]">
          <button
            type="button"
            className="cf-btn px-2 py-1"
            disabled={zoom <= MIN_ZOOM}
            onClick={() =>
              applyZoom(
                (viewportRef.current?.getBoundingClientRect().left ?? 0) +
                  (viewportRef.current?.clientWidth ?? 0) / 2,
                clampZoom(zoom * 0.5)
              )
            }
          >
            −
          </button>
          <button
            type="button"
            className="w-10 text-center"
            onClick={() => {
              setZoom(MIN_ZOOM)
              zoomRef.current = MIN_ZOOM
              if (viewportRef.current) viewportRef.current.scrollLeft = 0
            }}
          >
            {zoom >= 10 ? `${Math.round(zoom)}×` : `${Math.round(zoom * 10) / 10}×`}
          </button>
          <button
            type="button"
            className="cf-btn px-2 py-1"
            disabled={zoom >= MAX_ZOOM}
            onClick={() =>
              applyZoom(
                (viewportRef.current?.getBoundingClientRect().left ?? 0) +
                  (viewportRef.current?.clientWidth ?? 0) / 2,
                clampZoom(zoom * 2)
              )
            }
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="cf-scroll min-h-0 flex-1 overflow-x-auto px-2 py-2"
        onScroll={() => {
          const viewport = viewportRef.current
          if (viewport) scrollLeftRef.current = viewport.scrollLeft
          if (programmaticScrollRef.current) return
          userScrolledRef.current = true
        }}
      >
        <div
          ref={trackRef}
          className="relative cursor-crosshair"
          style={{ width: `${zoom * 100}%`, minWidth: "100%" }}
          onClick={(event) => {
            if (durationMs <= 0) return
            onSeekSource(ratioFromPointer(event.clientX) * durationMs)
          }}
        >
          {/* Filmstrip of KEEP blocks */}
          <div className="relative mb-1 flex h-10 overflow-hidden rounded border border-[#232733] bg-[#0d0f14]">
            {segments.map((segment) => (
              <div
                key={
                  segment.id ??
                  `${segment.segmentIndex}-${segment.sourceStartMs}`
                }
                className="absolute inset-y-0 border-r border-[#0a0b0e]"
                style={span(
                  segment.sourceStartMs,
                  segment.sourceEndMs,
                  durationMs
                )}
              >
                <div className="cf-keep absolute inset-0 opacity-80" />
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, transparent 0 10px, #00000033 10px 11px)",
                  }}
                />
              </div>
            ))}
            {cuts.map((cut) => (
              <button
                key={`strip-${cut.id}`}
                type="button"
                title="Preview cut"
                className={`absolute inset-y-0 z-[1] ${
                  cut.effectiveAction === "suggest" ? "cf-suggest" : "cf-cut"
                }`}
                style={span(cut.sourceStartMs, cut.sourceEndMs, durationMs)}
                onClick={(event) => {
                  event.stopPropagation()
                  onPreviewDecision(cut)
                }}
              />
            ))}
          </div>

          {/* Waveform */}
          <div className="relative mb-1 h-16 overflow-hidden rounded border border-[#232733] bg-[#0d0f14]">
            <SynthWaveform
              durationMs={durationMs}
              segments={segments}
              decisions={decisions}
              className="absolute inset-0 size-full"
            />
          </div>

          {/* Captions / decision chips */}
          <div className="relative h-7 overflow-hidden rounded border border-[#232733] bg-[#0d0f14]">
            <span className="cf-label absolute top-1 left-2 z-[2]">Cuts</span>
            {cuts.map((cut) => (
              <button
                key={`lane-${cut.id}`}
                type="button"
                className={`absolute top-1 bottom-1 rounded-sm ${
                  cut.effectiveAction === "suggest" ? "cf-suggest" : "cf-cut"
                }`}
                style={span(cut.sourceStartMs, cut.sourceEndMs, durationMs)}
                title={`${cut.type} · ${formatClock(cut.sourceStartMs)}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onPreviewDecision(cut)
                }}
              />
            ))}
          </div>

          <div
            ref={playheadRef}
            className="cf-playhead pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2"
            style={{ left: `${playheadRatioRef.current * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
