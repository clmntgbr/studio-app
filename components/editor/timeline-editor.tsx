"use client"

import "@/components/editor/factory/factory.css"
import { FormatPicker } from "@/components/editor/factory/format-picker"
import { PipelineSteps } from "@/components/editor/factory/pipeline-steps"
import { SequenceRail } from "@/components/editor/factory/sequence-rail"
import { SilenceDrawer } from "@/components/editor/factory/silence-drawer"
import { SynthWaveform } from "@/components/editor/factory/synth-waveform"
import { buildEditorDecisions } from "@/lib/editor/decisions"
import { formatClock, EMPTY_SEGMENTS } from "@/lib/editor/timeline-mapper"
import { useTimelineEvents } from "@/lib/editor/use-timeline-events"
import { useTimelinePlayer } from "@/lib/editor/use-timeline-player"
import type { PlaybackTime } from "@/lib/editor/use-timeline-player"
import {
  useMedia,
  useMediaConfiguration,
  useMediaDetections,
  useMediaPlayback,
  useMediaSteps,
  useProjectClips,
  useProjectMedia,
  useUpdateMediaConfiguration,
} from "@/lib/media/hooks"
import {
  pickDefaultPreset,
  previewAspectStyle,
  renderKindForPreset,
} from "@/lib/output-presets/format"
import {
  useCreateProjectRender,
  useOutputPresets,
  useProjectRenders,
} from "@/lib/output-presets/hooks"
import type { OutputPreset } from "@/lib/output-presets/types"
import { usePreviewTimeline, useProjectTimeline } from "@/lib/timeline/hooks"
import type { Timeline } from "@/lib/timeline/types"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

function compressionPct(originalMs: number, keptMs: number) {
  if (originalMs <= 0) return 0
  return Math.round(((originalMs - keptMs) / originalMs) * 100)
}

function LiveClock({
  subscribe,
  outputDurationMs,
}: {
  subscribe: (listener: (time: PlaybackTime) => void) => () => void
  outputDurationMs: number
}) {
  const [label, setLabel] = useState("00:00 / 00:00")
  useEffect(() => {
    return subscribe(({ outputMs }) => {
      setLabel(`${formatClock(outputMs)} / ${formatClock(outputDurationMs)}`)
    })
  }, [outputDurationMs, subscribe])
  return <span className="tabular-nums text-[#b8ff3c]">{label}</span>
}

export function TimelineEditor({ projectId }: { projectId: string }) {
  const { data: saved, isLoading, error, refetch, isFetching } =
    useProjectTimeline(projectId)
  const previewMut = usePreviewTimeline(projectId)
  const createRender = useCreateProjectRender(projectId)
  const mediaList = useProjectMedia(projectId)
  const clips = useProjectClips(projectId)
  const presetsQuery = useOutputPresets()
  const rendersQuery = useProjectRenders(projectId)

  const [preview, setPreview] = useState<Timeline | null>(null)
  const [viewMode, setViewMode] = useState<"saved" | "preview">("saved")
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionOk, setActionOk] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [sourceVideo, setSourceVideo] = useState<HTMLVideoElement | null>(null)
  const [shortVideo, setShortVideo] = useState<HTMLVideoElement | null>(null)
  const [sourceClock, setSourceClock] = useState("00:00")
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [silenceOpen, setSilenceOpen] = useState(false)
  const [awaitingRebuild, setAwaitingRebuild] = useState(false)
  const awaitingRebuildRef = useRef(false)
  const seenTimelineUpdateRef = useRef(false)
  const REBUILD_TIMEOUT_MS = 90_000

  function finishRebuildWait(opts?: { error?: string; ok?: string }) {
    awaitingRebuildRef.current = false
    seenTimelineUpdateRef.current = false
    setAwaitingRebuild(false)
    if (opts?.error) {
      setActionError(opts.error)
      return
    }
    setSilenceOpen(false)
    setPreview(null)
    setViewMode("saved")
    setActionOk(opts?.ok ?? "Timeline rebuilt after silence settings")
    void refetch()
  }

  function quickStepsIdle(
    steps:
      | { kind: string; status: string; errorMessage?: string | null }[]
      | undefined
  ): { idle: boolean; failed: string | null } {
    const silence = steps?.find((s) => s.kind === "silence")
    const text = steps?.find((s) => s.kind === "text")
    const busyStatus = new Set(["queued", "running", "pending"])
    if (silence?.status === "failed") {
      return {
        idle: false,
        failed: silence.errorMessage || "Silence reanalyze failed",
      }
    }
    if (text?.status === "failed") {
      return {
        idle: false,
        failed: text.errorMessage || "Text reanalyze failed",
      }
    }
    const silenceBusy = silence ? busyStatus.has(silence.status) : false
    const textBusy = text ? busyStatus.has(text.status) : false
    return { idle: !silenceBusy && !textBusy, failed: null }
  }

  const timeline = viewMode === "preview" && preview ? preview : saved

  const mediaId = useMemo(() => {
    const fromSegments = timeline?.segments[0]?.mediaFileId
    if (fromSegments) return fromSegments
    return mediaList.data?.[0]?.id ?? null
  }, [timeline?.segments, mediaList.data])

  const media = useMedia(mediaId)
  const mediaSteps = useMediaSteps(mediaId)
  const playback = useMediaPlayback(mediaId, !!mediaId)
  const configQuery = useMediaConfiguration(mediaId)
  const updateConfig = useUpdateMediaConfiguration(mediaId ?? "")
  const detections = useMediaDetections(mediaId, {
    mediaStatus: media.data?.status,
    steps: media.data?.steps ?? mediaSteps.data?.steps,
  })

  const segments = timeline?.segments ?? EMPTY_SEGMENTS
  const editorDecisions = useMemo(
    () =>
      buildEditorDecisions(detections.data ?? [], timeline?.decisions ?? []),
    [detections.data, timeline?.decisions]
  )

  const sourceDurationMs = useMemo(() => {
    if (media.data?.durationMs && media.data.durationMs > 0) {
      return media.data.durationMs
    }
    let max = 0
    for (const s of segments) max = Math.max(max, s.sourceEndMs)
    for (const d of editorDecisions) max = Math.max(max, d.sourceEndMs)
    return max
  }, [media.data?.durationMs, segments, editorDecisions])

  const outputDurationMs = timeline?.durationMs ?? 0
  const versionKey = timeline
    ? `${timeline.id ?? "preview"}:${timeline.version ?? viewMode}:${timeline.fingerprint}`
    : null

  const player = useTimelinePlayer(
    sourceVideo,
    segments,
    playback.data?.url ?? null,
    versionKey
  )

  // Clock + lightly throttled short preview sync (avoid Range-request thrash).
  useEffect(() => {
    if (!playback.data?.url) return
    let lastShortSync = 0
    return player.subscribe(({ sourceMs }) => {
      setSourceClock(formatClock(sourceMs))
      if (!shortVideo) return
      const now = performance.now()
      if (now - lastShortSync < 250) return
      lastShortSync = now
      const next = sourceMs / 1000
      if (Math.abs(shortVideo.currentTime - next) > 0.35) {
        try {
          shortVideo.currentTime = next
        } catch {
          // ignore
        }
      }
    })
  }, [playback.data?.url, player.subscribe, shortVideo])

  useEffect(() => {
    if (!shortVideo || !playback.data?.url) return
    if (shortVideo.getAttribute("src") !== playback.data.url) {
      shortVideo.src = playback.data.url
    }
  }, [playback.data?.url, shortVideo])

  useEffect(() => {
    if (!shortVideo) return
    if (playing && shortVideo.paused) void shortVideo.play().catch(() => {})
    if (!playing && !shortVideo.paused) shortVideo.pause()
  }, [playing, shortVideo])

  // Spacebar play/pause when editor is focused.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space") return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }
      if (!playback.data?.url) return
      event.preventDefault()
      player.togglePlayback()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [playback.data?.url, player.togglePlayback])

  const selectedPreset = useMemo(() => {
    const list = presetsQuery.data ?? []
    if (selectedPresetId) {
      return list.find((p) => p.id === selectedPresetId) ?? null
    }
    return pickDefaultPreset(
      list,
      media.data?.width,
      media.data?.height
    )
  }, [
    presetsQuery.data,
    selectedPresetId,
    media.data?.width,
    media.data?.height,
  ])

  useEffect(() => {
    if (selectedPresetId || !presetsQuery.data?.length) return
    const fallback = pickDefaultPreset(
      presetsQuery.data,
      media.data?.width,
      media.data?.height
    )
    if (fallback) setSelectedPresetId(fallback.id)
  }, [
    selectedPresetId,
    presetsQuery.data,
    media.data?.width,
    media.data?.height,
  ])

  const outputFrame = previewAspectStyle(
    selectedPreset,
    media.data?.width,
    media.data?.height
  )

  const onTimelineRealtime = useCallback(() => {
    if (!awaitingRebuildRef.current) return
    seenTimelineUpdateRef.current = true
    setActionOk("Timeline updating…")
    void refetch()
  }, [refetch])

  useTimelineEvents(projectId, mediaId, onTimelineRealtime)

  // Finish wait only when silence+text are idle AND we saw a timeline.updated.
  useEffect(() => {
    if (!awaitingRebuild) return
    const { idle, failed } = quickStepsIdle(mediaSteps.data?.steps)
    if (failed) {
      finishRebuildWait({ error: failed })
      return
    }
    if (!idle || !seenTimelineUpdateRef.current) return
    const timer = window.setTimeout(() => {
      if (!awaitingRebuildRef.current) return
      const again = quickStepsIdle(mediaSteps.data?.steps)
      if (again.failed) {
        finishRebuildWait({ error: again.failed })
        return
      }
      if (!again.idle) return
      finishRebuildWait({ ok: "Timeline rebuilt after silence settings" })
    }, 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finishRebuildWait is stable enough via refs
  }, [awaitingRebuild, mediaSteps.data?.steps])

  // Timeout / unlock if realtime is missed.
  useEffect(() => {
    if (!awaitingRebuild) return
    const timer = window.setTimeout(() => {
      if (!awaitingRebuildRef.current) return
      void refetch()
      finishRebuildWait({
        error:
          "Rebuild timed out — refresh the timeline or try saving again.",
      })
    }, REBUILD_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingRebuild, refetch])

  const latestRender = (rendersQuery.data ?? [])[0]
  const renderInFlight =
    latestRender &&
    (latestRender.status === "queued" ||
      latestRender.status === "running" ||
      latestRender.status === "pending")
  const shipping = createRender.isPending || !!renderInFlight
  const shipped = latestRender?.status === "completed"

  const busy =
    previewMut.isPending ||
    createRender.isPending ||
    updateConfig.isPending ||
    awaitingRebuild ||
    isFetching
  const title =
    media.data?.title ||
    media.data?.originalFilename ||
    "UNTITLED_SOURCE"
  const projectLabel = title
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28)
    .toUpperCase() || "PROJECT"

  const removedPct = compressionPct(sourceDurationMs, outputDurationMs)
  const selectedClips = (clips.data ?? []).filter((c) => c.selected)
  const queueClips = (clips.data ?? []).slice(0, 8)
  const recentRenders = (rendersQuery.data ?? []).slice(0, 6)

  function onSelectPreset(preset: OutputPreset) {
    setSelectedPresetId(preset.id)
    setActionOk(null)
  }

  async function onPreview() {
    setActionError(null)
    setActionOk(null)
    try {
      const data = await previewMut.mutateAsync(mediaId ?? undefined)
      setPreview(data)
      setViewMode("preview")
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Preview failed")
    }
  }

  async function onSaveSilence(payload: {
    patch: Parameters<typeof updateConfig.mutateAsync>[0]["patch"]
  }) {
    if (!mediaId) {
      setActionError("No media for silence settings")
      return
    }
    setActionError(null)
    setActionOk(null)
    try {
      seenTimelineUpdateRef.current = false
      awaitingRebuildRef.current = true
      setAwaitingRebuild(true)
      await updateConfig.mutateAsync(payload)
      // Don't overwrite a completion that already landed during mutate.
      if (awaitingRebuildRef.current) {
        setActionOk("Regenerating silence & text — waiting for timeline…")
      }
    } catch (err) {
      awaitingRebuildRef.current = false
      seenTimelineUpdateRef.current = false
      setAwaitingRebuild(false)
      setActionError(
        err instanceof Error ? err.message : "Failed to apply silence settings"
      )
    }
  }

  async function onShip() {
    if (!selectedPreset) {
      setActionError("Choisis un format de sortie")
      return
    }
    if (segments.length === 0) {
      setActionError("Timeline vide — lance Rebuild d'abord")
      return
    }
    setActionError(null)
    setActionOk(null)
    try {
      const render = await createRender.mutateAsync({
        presetId: selectedPreset.id,
        kind: renderKindForPreset(selectedPreset),
      })
      setViewMode("saved")
      setPreview(null)
      setActionOk(`Ship · render ${render.status} (${selectedPreset.name})`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Ship failed")
    }
  }

  return (
    <div className="clip-factory flex h-[100dvh] min-h-0 flex-col gap-2 overflow-hidden p-3">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-baseline gap-3">
            <Link
              href={`/projects/${projectId}`}
              className="cf-label hover:text-[#ff4d9a]"
            >
              ← Studio
            </Link>
            <h1 className="text-xl tracking-tight sm:text-2xl">
              <span className="cf-pink font-semibold">CLIP FACTORY</span>
              <span className="text-[#8b93a7]"> / EDIT</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8b93a7]">
            <span>
              PROJECT / <span className="text-[#f2f4f8]">{projectLabel}</span>
            </span>
            <span>
              MEDIA /{" "}
              <span className="text-[#f2f4f8]">
                {(mediaId ?? "—").slice(0, 8)}
              </span>
            </span>
            <span>
              VIEW /{" "}
              <span className="text-[#f2f4f8] uppercase">{viewMode}</span>
            </span>
          </div>
          <PipelineSteps
            steps={media.data?.steps}
            timelineReady={Boolean(timeline && segments.length > 0)}
            shipping={shipping}
            shipped={shipped}
          />
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="cf-label">Live status</div>
            <div className="cf-live text-3xl font-semibold leading-none">
              {String(selectedClips.length || queueClips.length || 0).padStart(
                2,
                "0"
              )}
            </div>
            <div className="text-[10px] tracking-widest text-[#8b93a7] uppercase">
              Clips ready
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {preview ? (
              <>
                <button
                  type="button"
                  className="cf-btn"
                  data-active={viewMode === "saved"}
                  onClick={() => setViewMode("saved")}
                >
                  Saved
                </button>
                <button
                  type="button"
                  className="cf-btn"
                  onClick={() => setViewMode("preview")}
                >
                  Preview
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="cf-btn"
              disabled={busy || !mediaId}
              onClick={() => setSilenceOpen(true)}
            >
              Silence
            </button>
            <button
              type="button"
              className="cf-btn"
              disabled={busy}
              onClick={() => void refetch()}
            >
              Refresh
            </button>
            <button
              type="button"
              className="cf-btn"
              disabled={busy}
              onClick={() => void onPreview()}
            >
              {previewMut.isPending ? "Building…" : "Rebuild"}
            </button>
            <button
              type="button"
              className="cf-btn cf-btn-primary"
              disabled={busy || segments.length === 0 || !selectedPreset}
              onClick={() => void onShip()}
            >
              {createRender.isPending ? "Shipping…" : "Ship"}
            </button>
          </div>
        </div>
      </header>

      {actionOk ? (
        <div className="cf-panel shrink-0 border-[#b8ff3c55] px-3 py-2 text-[12px] text-[#b8ff3c]">
          {actionOk}
        </div>
      ) : null}
      {(actionError || error) && (
        <div className="cf-panel shrink-0 border-[#ff4d9a55] px-3 py-2 text-[12px] text-[#ff4d9a]">
          {actionError ?? (error as Error).message}
          {(error as Error | null)?.message?.toLowerCase().includes("not found")
            ? " — run Rebuild after detections."
            : ""}
        </div>
      )}

      <div className="grid min-h-[320px] flex-1 gap-3 lg:grid-cols-[1.4fr_0.7fr]">
        {/* Source program */}
        <div className="cf-panel relative flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-[#232733] px-3 py-2">
            <span className="cf-label">Program / Source_01</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#8b93a7]">{sourceClock}</span>
              <button
                type="button"
                className="cf-btn cf-btn-primary px-3 py-1"
                disabled={!playback.data?.url}
                onClick={player.togglePlayback}
              >
                {playing ? "Pause" : "Play"}
              </button>
            </div>
          </div>
          <div
            className="relative flex min-h-[240px] flex-1 cursor-pointer items-center justify-center bg-black"
            onClick={() => {
              if (!playback.data?.url) return
              player.togglePlayback()
            }}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault()
                if (playback.data?.url) player.togglePlayback()
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={playing ? "Pause video" : "Play video"}
          >
            {isLoading ? (
              <p className="text-[12px] text-[#8b93a7]">Loading timeline…</p>
            ) : playback.isError ? (
              <p className="text-[12px] text-[#ff4d9a]">
                Proxy unavailable — check media / proxy step.
              </p>
            ) : playback.data?.url ? (
              <video
                ref={setSourceVideo}
                src={playback.data.url}
                className="h-full max-h-full w-full object-contain"
                playsInline
                preload="auto"
                controls
                onPlay={() => {
                  setPlaying(true)
                  setVideoError(null)
                }}
                onPause={() => setPlaying(false)}
                onError={() =>
                  setVideoError(
                    "Video failed to load — proxy stream / MinIO unavailable."
                  )
                }
                onLoadedData={() => setVideoError(null)}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <p className="text-[12px] text-[#8b93a7]">
                {mediaId ? "Loading playback…" : "No media yet."}
              </p>
            )}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-3 text-[10px] text-[#b8ff3c]">
              <span>RECUT PREVIEW</span>
              <span>
                KEEP {segments.length} · −{removedPct}%
              </span>
            </div>
            {videoError ? (
              <div className="absolute inset-x-3 bottom-3 rounded border border-[#ff4d9a55] bg-[#0a0b0ecc] px-3 py-2 text-[11px] text-[#ff4d9a]">
                {videoError}
              </div>
            ) : null}
            {playback.data?.url && !playing && !videoError ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex size-16 items-center justify-center rounded-full border border-[#b8ff3c] bg-[#0a0b0ecc] text-2xl text-[#b8ff3c] shadow-[0_0_24px_#b8ff3c55]">
                  ▶
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Short output + queue */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="cf-panel relative flex min-h-[220px] flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-[#232733] px-3 py-2">
              <span className="cf-label">
                Output / {selectedPreset?.aspectRatio ?? "—"}
                {selectedPreset ? ` · ${selectedPreset.name}` : ""}
              </span>
              <LiveClock
                subscribe={player.subscribe}
                outputDurationMs={outputDurationMs}
              />
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[#050608]">
              <div
                className="relative h-full max-h-full max-w-full overflow-hidden rounded-md border border-[#232733] bg-black"
                style={{ aspectRatio: outputFrame.aspectRatio }}
              >
                {playback.data?.url ? (
                  <video
                    ref={setShortVideo}
                    className="size-full"
                    style={{ objectFit: outputFrame.objectFit }}
                    playsInline
                    muted
                    preload="metadata"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-[11px] text-[#8b93a7]">
                    waiting
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-[11px] tracking-widest text-white/80 uppercase drop-shadow-[0_2px_8px_#000]">
                  {selectedPreset?.name ?? "Pick format"}
                </div>
              </div>
            </div>
          </div>

          <div className="cf-panel max-h-44 overflow-hidden">
            <div className="border-b border-[#232733] px-3 py-2">
              <span className="cf-label">Render queue</span>
            </div>
            <ul className="cf-scroll max-h-32 overflow-y-auto px-2 py-1 text-[11px]">
              {recentRenders.length > 0
                ? recentRenders.map((job, index) => (
                    <li
                      key={job.id}
                      className="flex items-center justify-between gap-2 border-b border-[#1a1d27] px-1 py-1.5 last:border-0"
                    >
                      <span className="truncate text-[#f2f4f8]">
                        MASTER_{String(index + 1).padStart(2, "0")} · {job.kind}
                      </span>
                      <span
                        className={
                          job.status === "completed"
                            ? "shrink-0 text-[#b8ff3c]"
                            : job.status === "failed"
                              ? "shrink-0 text-[#ff4d9a]"
                              : "shrink-0 text-[#5ce1ff]"
                        }
                      >
                        {job.status.toUpperCase()}
                        {job.progress > 0 && job.progress < 1
                          ? ` ${Math.round(job.progress * 100)}%`
                          : ""}
                      </span>
                    </li>
                  ))
                : queueClips.length === 0 ? (
                    <li className="px-1 py-2 text-[#8b93a7]">
                      Choisis un format puis Ship.
                    </li>
                  ) : (
                    queueClips.map((clip, index) => (
                      <li
                        key={clip.id}
                        className="flex items-center justify-between gap-2 border-b border-[#1a1d27] px-1 py-1.5 last:border-0"
                      >
                        <span className="truncate text-[#f2f4f8]">
                          SHORT_{String(index + 1).padStart(2, "0")}.mp4
                        </span>
                        <span className="shrink-0 text-[#b8ff3c]">
                          {clip.selected ? "✓ SEL" : "READY"}
                        </span>
                      </li>
                    ))
                  )}
            </ul>
          </div>
        </div>
      </div>

      <div className="cf-scroll shrink-0 space-y-2 overflow-y-auto" style={{ maxHeight: "26vh" }}>
        <div className="cf-panel px-3 py-3">
          <FormatPicker
            presets={presetsQuery.data ?? []}
            selectedId={selectedPreset?.id ?? null}
            onSelect={onSelectPreset}
            disabled={busy}
          />
        </div>
        <div className="grid gap-2 md:grid-cols-[1.4fr_0.7fr]">
          <div className="cf-panel">
            <div className="flex items-center justify-between border-b border-[#232733] px-3 py-2">
              <span className="cf-label">Inspector / Cut density</span>
              <button
                type="button"
                className="cf-btn cf-btn-primary px-3 py-1"
                disabled={!playback.data?.url}
                onClick={player.togglePlayback}
              >
                {playing
                  ? "Pause"
                  : segments.length > 0
                    ? "Play cut"
                    : "Play"}
              </button>
            </div>
            <div className="relative h-14 bg-[#0d0f14]">
              {sourceDurationMs > 0 ? (
                <SynthWaveform
                  durationMs={sourceDurationMs}
                  segments={segments}
                  decisions={editorDecisions}
                  className="absolute inset-0 size-full"
                />
              ) : null}
            </div>
          </div>
          <div className="cf-panel px-3 py-2 text-[11px] text-[#8b93a7]">
            <div className="cf-label mb-2">Edit stats</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <span>Original</span>
              <span className="text-right text-[#f2f4f8]">
                {formatClock(sourceDurationMs)}
              </span>
              <span>Kept</span>
              <span className="text-right text-[#b8ff3c]">
                {formatClock(outputDurationMs)}
              </span>
              <span>Compression</span>
              <span className="text-right text-[#ff4d9a]">{removedPct}%</span>
              <span>Decisions</span>
              <span className="text-right text-[#f2f4f8]">
                {editorDecisions.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sequence */}
      <div className="h-[180px] shrink-0">
        {sourceDurationMs > 0 && timeline ? (
          <SequenceRail
            durationMs={sourceDurationMs}
            segments={segments}
            decisions={editorDecisions}
            playing={playing}
            subscribe={player.subscribe}
            onSeekSource={player.seekAndPlay}
            onPreviewDecision={(decision) =>
              player.previewSourceRange(
                decision.sourceStartMs,
                decision.sourceEndMs
              )
            }
          />
        ) : (
          <div className="cf-panel flex h-full items-center justify-center text-[12px] text-[#8b93a7]">
            {isLoading
              ? "Preparing sequence…"
              : "Timeline not ready — hit Rebuild after detections."}
          </div>
        )}
      </div>

      <SilenceDrawer
        open={silenceOpen}
        onOpenChange={setSilenceOpen}
        config={configQuery.data}
        saving={updateConfig.isPending || awaitingRebuild}
        onSave={onSaveSilence}
      />
    </div>
  )
}
