"use client"

import "@/components/editor/factory/factory.css"
import { FormatPicker } from "@/components/editor/factory/format-picker"
import { PipelineSteps } from "@/components/editor/factory/pipeline-steps"
import { SequenceRail } from "@/components/editor/factory/sequence-rail"
import { SilenceDrawer } from "@/components/editor/factory/silence-drawer"
import { SynthWaveform } from "@/components/editor/factory/synth-waveform"
import { buildEditorDecisions } from "@/lib/editor/decisions"
import { formatClock, EMPTY_SEGMENTS } from "@/lib/editor/timeline-mapper"
import { useRenderEvents } from "@/lib/editor/use-render-events"
import { useTimelineEvents } from "@/lib/editor/use-timeline-events"
import { useMediaEvents } from "@/lib/media/use-media-events"
import { useTimelinePlayer } from "@/lib/editor/use-timeline-player"
import type { PlaybackTime } from "@/lib/editor/use-timeline-player"
import {
  formatMasterSplit,
  parseMasterSplit,
  type MasterSplitState,
} from "@/lib/media/master-split"
import {
  useMedia,
  useMediaConfiguration,
  useMediaDetections,
  useMediaPlayback,
  useMediaSteps,
  useMediaClips,
  useUpdateClip,
  useUpdateMediaConfiguration,
} from "@/lib/media/hooks"
import {
  pickDefaultPreset,
  previewAspectStyle,
  renderKindForPreset,
} from "@/lib/output-presets/format"
import { createClipRender, downloadRender } from "@/lib/output-presets/api"
import {
  useCreateMediaRender,
  useOutputPresets,
  useMediaRenders,
} from "@/lib/output-presets/hooks"
import { queryKeys } from "@/lib/query/keys"
import { useQueryClient } from "@tanstack/react-query"
import type { OutputPreset } from "@/lib/output-presets/types"
import { usePreviewTimeline, useMediaTimeline } from "@/lib/timeline/hooks"
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

function KeptScrubber({
  subscribe,
  durationMs,
  onSeek,
  disabled = false,
}: {
  subscribe: (listener: (time: PlaybackTime) => void) => () => void
  durationMs: number
  onSeek: (ms: number) => void
  disabled?: boolean
}) {
  const [value, setValue] = useState(0)
  const dragging = useRef(false)
  useEffect(() => {
    return subscribe(({ outputMs, sourceMs }) => {
      if (dragging.current) return
      setValue(Math.round(outputMs > 0 || durationMs > 0 ? outputMs : sourceMs))
    })
  }, [durationMs, subscribe])
  if (durationMs <= 0) return null
  return (
    <input
      type="range"
      min={0}
      max={durationMs}
      step={40}
      value={Math.min(value, durationMs)}
      disabled={disabled}
      className="cf-scrub w-full accent-[#b8ff3c]"
      aria-label="Seek kept timeline"
      onPointerDown={() => {
        if (disabled) return
        dragging.current = true
      }}
      onPointerUp={(event) => {
        dragging.current = false
        if (disabled) return
        onSeek(Number(event.currentTarget.value))
      }}
      onChange={(event) => {
        if (disabled) return
        const next = Number(event.currentTarget.value)
        setValue(next)
        onSeek(next)
      }}
    />
  )
}

export function TimelineEditor({ mediaId }: { mediaId: string }) {
  const media = useMedia(mediaId)
    const { data: saved, isLoading, error, refetch } =
    useMediaTimeline(mediaId)
  const previewMut = usePreviewTimeline(mediaId)
  const queryClient = useQueryClient()
  const createRender = useCreateMediaRender(mediaId)
  const updateClipMut = useUpdateClip(mediaId)
  const clips = useMediaClips(mediaId || null)
  const presetsQuery = useOutputPresets()
  const rendersQuery = useMediaRenders(mediaId)
  useRenderEvents(mediaId)
  const [renderingClips, setRenderingClips] = useState(false)
  const [burnSubtitles, setBurnSubtitles] = useState(false)
  const [renderPrefsHydrated, setRenderPrefsHydrated] = useState(false)

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
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const awaitingRebuildRef = useRef(false)
  const editingLockedRef = useRef(false)
  const seenTimelineUpdateRef = useRef(false)
  const prevRenderStatusRef = useRef<string | null>(null)
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

  useMediaEvents(mediaId)

  const mediaSteps = useMediaSteps(mediaId)
  const playback = useMediaPlayback(mediaId, !!mediaId)
  const configQuery = useMediaConfiguration(mediaId)
  const updateConfig = useUpdateMediaConfiguration(mediaId)
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

  // Clock in output (kept) time when timeline has cuts; short preview sync.
  useEffect(() => {
    if (!playback.data?.url) return
    let lastShortSync = 0
    return player.subscribe(({ sourceMs, outputMs }) => {
      const total =
        outputDurationMs > 0 ? outputDurationMs : sourceDurationMs
      const current = outputDurationMs > 0 ? outputMs : sourceMs
      setSourceClock(`${formatClock(current)} / ${formatClock(total)}`)
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
  }, [
    playback.data?.url,
    player.subscribe,
    shortVideo,
    outputDurationMs,
    sourceDurationMs,
  ])

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
      if (editingLockedRef.current) return
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
    setRenderPrefsHydrated(false)
    setSelectedPresetId(null)
    setBurnSubtitles(false)
  }, [mediaId])

  useEffect(() => {
    if (renderPrefsHydrated || !configQuery.data) return
    setBurnSubtitles(!!configQuery.data.burnSubtitles)
    if (configQuery.data.outputPresetId) {
      setSelectedPresetId(configQuery.data.outputPresetId)
    }
    setRenderPrefsHydrated(true)
  }, [configQuery.data, renderPrefsHydrated])

  useEffect(() => {
    if (!renderPrefsHydrated) return
    if (selectedPresetId || !presetsQuery.data?.length) return
    if (configQuery.data?.outputPresetId) return
    const fallback = pickDefaultPreset(
      presetsQuery.data,
      media.data?.width,
      media.data?.height
    )
    if (fallback) setSelectedPresetId(fallback.id)
  }, [
    renderPrefsHydrated,
    selectedPresetId,
    presetsQuery.data,
    media.data?.width,
    media.data?.height,
    configQuery.data?.outputPresetId,
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

  useTimelineEvents(mediaId, onTimelineRealtime)

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
  const renderInFlight = (rendersQuery.data ?? []).some(
    (r) =>
      r.status === "queued" || r.status === "running" || r.status === "pending"
  )
  const hasCompletedRender = (rendersQuery.data ?? []).some((r) => r.status === "completed")

  useEffect(() => {
    const status = latestRender?.status ?? null
    const prev = prevRenderStatusRef.current
    prevRenderStatusRef.current = status
    if (!latestRender || status !== "completed") return
    if (
      prev === "queued" ||
      prev === "running" ||
      prev === "pending" ||
      prev === null
    ) {
      // Only toast when we observe a transition into completed (or first load with done).
      if (prev != null) {
        setActionOk("Render done — download your file in Render queue")
      }
    }
  }, [latestRender?.id, latestRender?.status])

  const mediaStatus = media.data?.status ?? ""
  const pipelineNotReady =
    mediaStatus !== "" &&
    mediaStatus !== "ready" &&
    mediaStatus !== "rendering"
  // Lock edits while pipeline incomplete, rebuild / silence regen, or render in flight.
  const rendering =
    mediaStatus === "rendering" ||
    createRender.isPending ||
    renderingClips ||
    !!renderInFlight
  const editingLocked =
    pipelineNotReady ||
    previewMut.isPending ||
    updateConfig.isPending ||
    awaitingRebuild ||
    rendering
  editingLockedRef.current = editingLocked
  const busy = editingLocked
  const canRender = mediaStatus === "ready" || mediaStatus === "rendering"
  const renderProgress =
    latestRender && renderInFlight
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              (latestRender.progress ?? 0) <= 1
                ? (latestRender.progress ?? 0) * 100
                : (latestRender.progress ?? 0)
            )
          )
        )
      : null
  const lockReason = pipelineNotReady
    ? mediaStatus === "uploading" || mediaStatus === "fetching"
      ? `Media ${mediaStatus} — wait until ready…`
      : mediaStatus === "failed"
        ? "Media failed — edits locked"
        : "Processing — wait until all steps finish…"
    : awaitingRebuild
      ? "Rebuilding timeline — edits locked…"
      : previewMut.isPending
        ? "Building preview — edits locked…"
        : updateConfig.isPending
          ? "Saving settings — edits locked…"
          : rendering
            ? renderProgress != null
              ? `Rendering — ${latestRender?.status ?? "render"} ${renderProgress}%…`
              : "Rendering — edits locked…"
            : null

  useEffect(() => {
    if (!editingLocked || !playing || !sourceVideo) return
    sourceVideo.pause()
  }, [editingLocked, playing, sourceVideo])

  const title =
    media.data?.title ||
    media.data?.originalFilename ||
    "UNTITLED_SOURCE"
  const mediaLabel = title
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28)
    .toUpperCase() || "MEDIA"

  const removedPct = compressionPct(sourceDurationMs, outputDurationMs)
  const allClips = clips.data ?? []
  const selectedClips = allClips.filter((c) => c.selected)
  const recentRenders = (rendersQuery.data ?? []).slice(0, 6)
  const verticalPresetId = useMemo(() => {
    const list = presetsQuery.data ?? []
    const vertical = list.find(
      (p) => p.aspectRatio === "9:16" || (p.height > 0 && p.width / p.height < 1)
    )
    return vertical?.id ?? null
  }, [presetsQuery.data])

  async function onSelectPreset(preset: OutputPreset) {
    if (editingLocked) return
    setSelectedPresetId(preset.id)
    setActionOk(null)
    if (!mediaId) return
    try {
      await updateConfig.mutateAsync({ outputPresetId: preset.id })
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to save format"
      )
    }
  }

  async function onBurnSubtitlesChange(next: boolean) {
    setBurnSubtitles(next)
    if (!mediaId) return
    try {
      await updateConfig.mutateAsync({ burnSubtitles: next })
    } catch (err) {
      setBurnSubtitles(!next)
      setActionError(
        err instanceof Error ? err.message : "Failed to save burn subtitles"
      )
    }
  }

  async function onPreview() {
    setActionError(null)
    setActionOk(null)
    try {
      const data = await previewMut.mutateAsync()
      setPreview(data)
      setViewMode("preview")
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Preview failed")
    }
  }

  async function onSaveSilence(payload: {
    patch: {
      silenceEnabled?: boolean
      detectionLevel?: string
      paddingBeforeMs?: number
      paddingAfterMs?: number
      silenceMinDurationMs?: number
      fillersEnabled?: boolean
      repetitionsEnabled?: boolean
    }
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
      await updateConfig.mutateAsync({ ...payload, reanalyze: true })
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

  async function onToggleClipSelected(clipId: string, selected: boolean) {
    if (editingLocked) return
    setActionError(null)
    try {
      await updateClipMut.mutateAsync({ clipId, selected })
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update clip selection"
      )
    }
  }

  async function onRender() {
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
    setRenderingClips(true)
    try {
      const render = await createRender.mutateAsync({
        presetId: selectedPreset.id,
        kind: renderKindForPreset(selectedPreset),
        burnSubtitles,
        force: true,
      })
      const toRender = selectedClips
      // Queue clip jobs one-by-one; worker-render is serial (no parallel encodes).
      if (toRender.length > 0) {
        let failed = 0
        for (const c of toRender) {
          try {
            await createClipRender(c.id, {
              ...(verticalPresetId ? { presetId: verticalPresetId } : {}),
              burnSubtitles,
              force: true,
            })
          } catch {
            failed += 1
          }
        }
        if (failed > 0) {
          setActionError(
            `Master queued; ${failed}/${toRender.length} clip renders failed`
          )
        }
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.renders.byMedia(mediaId),
      })
      setViewMode("saved")
      setPreview(null)
      const clipNote =
        toRender.length > 0
          ? ` + ${toRender.length} clip${toRender.length > 1 ? "s" : ""}`
          : ""
      setActionOk(
        `Rendering ${selectedPreset.name}${clipNote} — ${render.status}…`
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Render failed")
    } finally {
      setRenderingClips(false)
    }
  }

  async function onDownloadRender(renderId: string) {
    setActionError(null)
    setDownloadingId(renderId)
    try {
      await downloadRender(renderId)
      setActionOk("Download started")
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Download failed")
    } finally {
      setDownloadingId(null)
    }
  }

  const masterSplit = parseMasterSplit(configQuery.data?.masterSplit)
  async function onMasterSplitChange(next: MasterSplitState) {
    setActionError(null)
    try {
      await updateConfig.mutateAsync({
        masterSplit: formatMasterSplit(next),
      })
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to save master split"
      )
    }
  }

  return (
    <div className="clip-factory flex h-[100dvh] min-h-0 flex-col gap-2 overflow-hidden p-3">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-baseline gap-3">
            <Link
              href="/"
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
              MEDIA / <span className="text-[#f2f4f8]">{mediaLabel}</span>
            </span>
            <span>
              MEDIA /{" "}
              {mediaId ? (
                <Link
                  href={`/media/${mediaId}`}
                  className="text-[#f2f4f8] underline decoration-[#3a4154] underline-offset-2 hover:text-[#b8ff3c] hover:decoration-[#b8ff3c]"
                  title="Open media steps"
                >
                  {mediaId.slice(0, 8)}
                </Link>
              ) : (
                <span className="text-[#f2f4f8]">—</span>
              )}
            </span>
            <span>
              VIEW /{" "}
              <span className="text-[#f2f4f8] uppercase">{viewMode}</span>
            </span>
          </div>
          <PipelineSteps
            steps={media.data?.steps ?? mediaSteps.data?.steps}
            timelineReady={Boolean(timeline && segments.length > 0)}
          />
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="cf-label">Live status</div>
            <div className="cf-live text-3xl font-semibold leading-none">
              {String(selectedClips.length).padStart(2, "0")}
              <span className="text-lg text-[#8b93a7]">
                /{String(allClips.length).padStart(2, "0")}
              </span>
            </div>
            <div className="text-[10px] tracking-widest text-[#8b93a7] uppercase">
              Clips selected
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {preview ? (
              <>
                <button
                  type="button"
                  className="cf-btn"
                  data-active={viewMode === "saved"}
                  disabled={editingLocked}
                  onClick={() => setViewMode("saved")}
                >
                  Saved
                </button>
                <button
                  type="button"
                  className="cf-btn"
                  disabled={editingLocked}
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
              disabled={editingLocked}
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
            {hasCompletedRender && latestRender ? (
              <button
                type="button"
                className="cf-btn cf-btn-primary"
                disabled={!!downloadingId}
                onClick={() => void onDownloadRender(latestRender.id)}
              >
                {downloadingId === latestRender.id
                  ? "Opening…"
                  : "Download"}
              </button>
            ) : null}
            <button
              type="button"
              className="cf-btn cf-btn-primary"
              disabled={
                !canRender ||
                createRender.isPending ||
                renderingClips ||
                segments.length === 0 ||
                !selectedPreset
              }
              onClick={() => void onRender()}
            >
              {rendering
                ? "Rendering…"
                : hasCompletedRender
                  ? "Render again"
                  : selectedClips.length > 0
                    ? `Render · master + ${selectedClips.length}`
                    : "Render · master"}
            </button>
          </div>
        </div>
      </header>

      {lockReason ? (
        <div className="cf-panel shrink-0 border-[#5ce1ff55] px-3 py-2 text-[12px] text-[#5ce1ff]">
          {lockReason}
        </div>
      ) : null}
      {hasCompletedRender && !lockReason ? (
        <div className="cf-panel shrink-0 border-[#b8ff3c55] px-3 py-2 text-[12px] text-[#b8ff3c]">
          Render complete — downloads in Render queue
        </div>
      ) : null}
      {latestRender?.status === "failed" && !lockReason ? (
        <div className="cf-panel shrink-0 border-[#ff4d9a55] px-3 py-2 text-[12px] text-[#ff4d9a]">
          Render failed
          {latestRender.errorMessage
            ? ` — ${latestRender.errorMessage}`
            : ""}
        </div>
      ) : null}
      {actionOk && !lockReason && !hasCompletedRender ? (
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
                disabled={editingLocked || !playback.data?.url}
                onClick={player.togglePlayback}
              >
                {playing ? "Pause" : "Play"}
              </button>
            </div>
          </div>
          <div
            className={`relative flex min-h-[240px] flex-1 items-center justify-center bg-black ${
              editingLocked ? "cursor-wait" : "cursor-pointer"
            }`}
            onClick={() => {
              if (editingLocked || !playback.data?.url) return
              player.togglePlayback()
            }}
            onKeyDown={(event) => {
              if (editingLocked) return
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault()
                if (playback.data?.url) player.togglePlayback()
              }
            }}
            role="button"
            tabIndex={editingLocked ? -1 : 0}
            aria-label={playing ? "Pause video" : "Play video"}
            aria-disabled={editingLocked}
          >
            {isLoading ? (
              <p className="text-[12px] text-[#8b93a7]">Loading timeline…</p>
            ) : playback.isError ? (
              <p className="text-[12px] text-[#ff4d9a]">
                Playback unavailable — wait for fetch/source, or check MinIO.
              </p>
            ) : playback.data?.url ? (
              <video
                ref={setSourceVideo}
                src={playback.data.url}
                className="h-full max-h-full w-full object-contain"
                playsInline
                preload="auto"
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
              <span>
                RECUT PREVIEW
                {playback.data?.kind === "source" ? " · SOURCE" : ""}
              </span>
              <span>
                KEEP {segments.length} · −{removedPct}%
                {outputDurationMs > 0
                  ? ` · ${formatClock(outputDurationMs)}`
                  : ""}
              </span>
            </div>
            {playback.data?.url ? (
              <div
                className={`absolute inset-x-3 bottom-3 z-[2] ${
                  editingLocked ? "pointer-events-none opacity-50" : ""
                }`}
                onClick={(event) => event.stopPropagation()}
              >
                <KeptScrubber
                  subscribe={player.subscribe}
                  durationMs={
                    outputDurationMs > 0 ? outputDurationMs : sourceDurationMs
                  }
                  disabled={editingLocked}
                  onSeek={(ms) => {
                    if (editingLocked) return
                    if (outputDurationMs > 0) player.seekOutput(ms)
                    else player.seekAndPlay(ms)
                  }}
                />
              </div>
            ) : null}
            {videoError ? (
              <div className="absolute inset-x-3 bottom-10 rounded border border-[#ff4d9a55] bg-[#0a0b0ecc] px-3 py-2 text-[11px] text-[#ff4d9a]">
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

          <div className="cf-panel max-h-56 overflow-hidden">
            <div className="border-b border-[#232733] px-3 py-2">
              <span className="cf-label">Clips · coche pour Render</span>
            </div>
            <ul className="cf-scroll max-h-24 overflow-y-auto px-2 py-1 text-[11px]">
              {allClips.length === 0 ? (
                <li className="px-1 py-2 text-[#8b93a7]">
                  Propositions LLM bientôt / aucune encore.
                </li>
              ) : (
                allClips.map((clip, index) => (
                  <li key={clip.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 border-b border-[#1a1d27] px-1 py-1.5 text-left last:border-0 disabled:opacity-50"
                      disabled={editingLocked || updateClipMut.isPending}
                      onClick={() =>
                        void onToggleClipSelected(clip.id, !clip.selected)
                      }
                    >
                      <span className="truncate text-[#f2f4f8]">
                        SHORT_{String(index + 1).padStart(2, "0")}
                        {clip.title || clip.hook
                          ? ` · ${clip.title || clip.hook}`
                          : ""}
                      </span>
                      <span
                        className={
                          clip.selected ? "text-[#b8ff3c]" : "text-[#8b93a7]"
                        }
                      >
                        {clip.selected ? "✓ RENDER" : "skip"}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="border-t border-[#232733] px-3 py-2">
              <span className="cf-label">Render queue</span>
            </div>
            <ul className="cf-scroll max-h-24 overflow-y-auto px-2 py-1 text-[11px]">
              {recentRenders.length === 0 ? (
                <li className="px-1 py-2 text-[#8b93a7]">
                  Render = master
                  {selectedClips.length > 0
                    ? ` + ${selectedClips.length} clip${selectedClips.length > 1 ? "s" : ""}`
                    : " (aucun clip coché)"}
                  .
                </li>
              ) : (
                recentRenders.map((job, index) => (
                  <li
                    key={job.id}
                    className="space-y-1 border-b border-[#1a1d27] px-1 py-1.5 last:border-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[#f2f4f8]">
                        {job.kind === "clip" ? "CLIP" : "MASTER"}_
                        {String(index + 1).padStart(2, "0")} · {job.kind}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className={
                            job.status === "completed"
                              ? "text-[#b8ff3c]"
                              : job.status === "failed"
                                ? "text-[#ff4d9a]"
                                : "text-[#5ce1ff]"
                          }
                        >
                          {job.status === "completed"
                            ? "DONE"
                            : job.status.toUpperCase()}
                        </span>
                        {job.status === "completed" ? (
                          <button
                            type="button"
                            className="cf-btn px-2 py-0.5 text-[10px]"
                            disabled={downloadingId === job.id}
                            onClick={() => void onDownloadRender(job.id)}
                            title={
                              (job.outputParts?.length ?? 0) > 0
                                ? "Download zip (master + parts)"
                                : "Download mp4"
                            }
                          >
                            {downloadingId === job.id ? "…" : "↓ DL"}
                          </button>
                        ) : null}
                      </span>
                    </div>
                    {job.status === "failed" && job.errorMessage ? (
                      <p className="truncate text-[10px] text-[#ff4d9a]/80">
                        {job.errorMessage}
                      </p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>

      <div className="cf-scroll shrink-0 space-y-2 overflow-y-auto" style={{ maxHeight: "26vh" }}>
        <div className="cf-panel space-y-3 px-3 py-3">
          <FormatPicker
            presets={presetsQuery.data ?? []}
            selectedId={selectedPreset?.id ?? null}
            onSelect={onSelectPreset}
            disabled={busy}
          />
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[#f2f4f8]">
            <input
              type="checkbox"
              className="accent-[#b8ff3c]"
              checked={burnSubtitles}
              disabled={busy || updateConfig.isPending}
              onChange={(e) => void onBurnSubtitlesChange(e.target.checked)}
            />
            <span>
              Incruster les SRT
              <span className="mt-0.5 block text-[10px] text-[#8b93a7]">
                Off = pas de sous-titres. On = SRT gravés dans le master et les
                clips cochés.
              </span>
            </span>
          </label>
          <div className="space-y-1.5 border-t border-[#232733] pt-2">
            <span className="cf-label">Split master (TikTok / multi)</span>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {(
                [
                  ["off", "Off"],
                  ["parts", "N parts"],
                  ["duration", "Max min"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`cf-btn px-2 py-1 ${
                    masterSplit.mode === mode ? "cf-btn-primary" : ""
                  }`}
                  disabled={busy || !mediaId || updateConfig.isPending}
                  onClick={() =>
                    void onMasterSplitChange({ ...masterSplit, mode })
                  }
                >
                  {label}
                </button>
              ))}
              {masterSplit.mode === "parts" ? (
                <label className="flex items-center gap-1 text-[#8b93a7]">
                  N
                  <input
                    type="number"
                    min={2}
                    max={50}
                    className="w-14 rounded border border-[#232733] bg-[#12141a] px-1 py-0.5 text-[#f2f4f8]"
                    defaultValue={masterSplit.parts}
                    key={`parts-${masterSplit.parts}`}
                    disabled={busy || updateConfig.isPending}
                    onBlur={(e) =>
                      void onMasterSplitChange({
                        ...masterSplit,
                        parts: Number(e.target.value) || 2,
                      })
                    }
                  />
                </label>
              ) : null}
              {masterSplit.mode === "duration" ? (
                <label className="flex items-center gap-1 text-[#8b93a7]">
                  min
                  <input
                    type="number"
                    min={1}
                    max={60}
                    className="w-14 rounded border border-[#232733] bg-[#12141a] px-1 py-0.5 text-[#f2f4f8]"
                    defaultValue={masterSplit.durationMin}
                    key={`dur-${masterSplit.durationMin}`}
                    disabled={busy || updateConfig.isPending}
                    onBlur={(e) =>
                      void onMasterSplitChange({
                        ...masterSplit,
                        durationMin: Number(e.target.value) || 10,
                      })
                    }
                  />
                </label>
              ) : null}
            </div>
            <p className="text-[10px] text-[#8b93a7]">
              Une valeur BDD{" "}
              <code className="text-[#5ce1ff]">
                {formatMasterSplit(masterSplit) || "off"}
              </code>
              . Master entier + parts P1… après Render.
            </p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-[1.4fr_0.7fr]">
          <div className="cf-panel">
            <div className="flex items-center justify-between border-b border-[#232733] px-3 py-2">
              <span className="cf-label">Inspector / Cut density</span>
              <button
                type="button"
                className="cf-btn cf-btn-primary px-3 py-1"
                disabled={editingLocked || !playback.data?.url}
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
      <div
        className={`h-[180px] shrink-0 ${
          editingLocked ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {sourceDurationMs > 0 && timeline ? (
          <SequenceRail
            durationMs={sourceDurationMs}
            segments={segments}
            decisions={editorDecisions}
            playing={playing}
            subscribe={player.subscribe}
            onSeekSource={(ms) => {
              if (editingLocked) return
              player.seekAndPlay(ms)
            }}
            onPreviewDecision={(decision) => {
              if (editingLocked) return
              player.previewSourceRange(
                decision.sourceStartMs,
                decision.sourceEndMs
              )
            }}
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
