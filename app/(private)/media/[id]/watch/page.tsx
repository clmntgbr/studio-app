"use client"

import {
  VideoPlayer,
  type VideoPlayerRef,
} from "@/components/base/video-player/video-player"
import { MediaSettingsDrawer } from "@/components/media/media-settings-drawer"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useMedia,
  useMediaConfiguration,
  useMediaPlayback,
  useMediaSteps,
  useProjectClips,
  useUpdateClip,
  useUpdateMediaConfiguration,
} from "@/lib/media/hooks"
import { useMediaEvents } from "@/lib/media/use-media-events"
import {
  formatFamily,
  pickDefaultPreset,
} from "@/lib/output-presets/format"
import type { OutputPreset } from "@/lib/output-presets/types"
import { useOutputPresets } from "@/lib/output-presets/hooks"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

/** Phone preview is always TikTok 9:16; format only toggles bars vs crop. */
const TIKTOK_ASPECT = 9 / 16

function previewObjectFit(
  preset: OutputPreset | null
): "contain" | "cover" {
  if (!preset) return "cover"
  const family = formatFamily(preset)
  // Vertical / cropped formats fill the phone. Others letterbox with black bars.
  if (family === "portrait") return "cover"
  if (preset.cropMode !== "none" && preset.aspectRatio === "9:16") return "cover"
  return "contain"
}

export default function MediaWatchPage() {
  const params = useParams<{ id: string }>()
  const mediaId = params.id
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [clipError, setClipError] = useState<string | null>(null)
  const [previewPresetId, setPreviewPresetId] = useState<string | null>(null)

  const { data: media } = useMedia(mediaId)
  const { data: stepsPayload } = useMediaSteps(mediaId)
  const steps = stepsPayload?.steps ?? media?.steps ?? []
  const projectId = media?.projectId ?? null
  useMediaEvents(projectId, mediaId)

  const configQuery = useMediaConfiguration(mediaId)
  const updateConfig = useUpdateMediaConfiguration(mediaId)
  const updateClipMut = useUpdateClip(projectId ?? "")
  const playback = useMediaPlayback(mediaId, !!mediaId)
  const { data: presets = [] } = useOutputPresets()

  const playerRef = useRef<VideoPlayerRef>(null)
  const mainStageRef = useRef<HTMLDivElement>(null)
  const cropVideoRef = useRef<HTMLVideoElement | null>(null)
  const skipPreviewRevertRef = useRef(false)
  const [mainVideo, setMainVideo] = useState<HTMLVideoElement | null>(null)
  const [mainHeight, setMainHeight] = useState(0)
  const [videoReady, setVideoReady] = useState(false)

  const clipsEnabled =
    !!projectId &&
    (media?.status === "ready" ||
      steps.some((s) => s.kind === "llm" && s.status === "completed"))
  const { data: projectClips = [], isLoading: clipsLoading } = useProjectClips(
    projectId,
    clipsEnabled
  )
  const clips = useMemo(
    () => projectClips.filter((c) => c.mediaFileId === mediaId),
    [projectClips, mediaId]
  )

  useEffect(() => {
    const saved = configQuery.data?.outputPresetId ?? null
    if (saved) setPreviewPresetId(saved)
  }, [configQuery.data?.outputPresetId])

  const selectedPreset = useMemo(() => {
    const id = previewPresetId ?? configQuery.data?.outputPresetId ?? null
    if (id) {
      const found = presets.find((p) => p.id === id)
      if (found) return found
    }
    return (
      presets.find(
        (p) => p.aspectRatio === "9:16" && formatFamily(p) === "portrait"
      ) ??
      presets.find((p) => formatFamily(p) === "portrait") ??
      pickDefaultPreset(presets, media?.width, media?.height)
    )
  }, [
    previewPresetId,
    configQuery.data?.outputPresetId,
    presets,
    media?.width,
    media?.height,
  ])

  const objectFit = previewObjectFit(selectedPreset)
  const phoneHeight = mainHeight > 0 ? mainHeight : 220
  const phoneWidth = Math.round(phoneHeight * TIKTOK_ASPECT)

  useEffect(() => {
    const stage = mainStageRef.current
    if (!stage) return
    const update = () => {
      const h = Math.round(stage.getBoundingClientRect().height)
      if (h > 0) setMainHeight(h)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [playback.data?.url])

  useEffect(() => {
    if (!playback.data?.url) {
      setMainVideo(null)
      setVideoReady(false)
      return
    }
    setVideoReady(false)
    let cancelled = false
    const attach = () => {
      const el = playerRef.current?.videoElement ?? null
      if (!cancelled) setMainVideo(el)
      if (!el && !cancelled) requestAnimationFrame(attach)
    }
    attach()
    return () => {
      cancelled = true
    }
  }, [playback.data?.url])

  useEffect(() => {
    if (!mainVideo) {
      setVideoReady(false)
      return
    }
    const markReady = () => setVideoReady(true)
    if (mainVideo.readyState >= 1) {
      markReady()
      return
    }
    mainVideo.addEventListener("loadedmetadata", markReady)
    mainVideo.addEventListener("loadeddata", markReady)
    return () => {
      mainVideo.removeEventListener("loadedmetadata", markReady)
      mainVideo.removeEventListener("loadeddata", markReady)
    }
  }, [mainVideo])

  useEffect(() => {
    const cropVideo = cropVideoRef.current
    if (!mainVideo || !cropVideo || !videoReady) return

    cropVideo.muted = true
    cropVideo.playsInline = true
    cropVideo.playbackRate = mainVideo.playbackRate

    const syncTime = (force = false) => {
      const drift = Math.abs(cropVideo.currentTime - mainVideo.currentTime)
      if (force || drift > 0.3) {
        try {
          cropVideo.currentTime = mainVideo.currentTime
        } catch {
          // ignore
        }
      }
    }

    const followPlay = () => {
      syncTime(true)
      void cropVideo.play().catch(() => undefined)
    }
    const followPause = () => cropVideo.pause()
    const followSeek = () => syncTime(true)
    const followRate = () => {
      cropVideo.playbackRate = mainVideo.playbackRate
    }
    const followTime = () => {
      if (!mainVideo.paused) syncTime(false)
    }

    mainVideo.addEventListener("play", followPlay)
    mainVideo.addEventListener("playing", followPlay)
    mainVideo.addEventListener("pause", followPause)
    mainVideo.addEventListener("seeked", followSeek)
    mainVideo.addEventListener("ratechange", followRate)
    mainVideo.addEventListener("timeupdate", followTime)

    if (!mainVideo.paused) followPlay()

    return () => {
      mainVideo.removeEventListener("play", followPlay)
      mainVideo.removeEventListener("playing", followPlay)
      mainVideo.removeEventListener("pause", followPause)
      mainVideo.removeEventListener("seeked", followSeek)
      mainVideo.removeEventListener("ratechange", followRate)
      mainVideo.removeEventListener("timeupdate", followTime)
    }
  }, [mainVideo, videoReady, playback.data?.url])

  async function onToggleClip(clipId: string, selected: boolean) {
    if (!projectId) return
    setClipError(null)
    try {
      await updateClipMut.mutateAsync({ clipId, selected })
    } catch (err) {
      setClipError(
        err instanceof Error ? err.message : "Failed to update clip selection"
      )
    }
  }

  const src = playback.data?.url
  const layoutReady = !!src && videoReady && mainHeight > 0

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => setSettingsOpen(true)}
        >
          Settings
        </Button>
      </div>

      <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start">
        <div ref={mainStageRef} className="relative min-w-0 flex-1">
          {!src ? (
            <Skeleton className="aspect-video w-full min-h-[200px] rounded-xl" />
          ) : (
            <>
              <VideoPlayer
                ref={playerRef}
                src={src}
                size="md"
                className="aspect-video w-full min-h-[200px]"
              />
              {!layoutReady ? (
                <Skeleton className="absolute inset-0 z-10 rounded-xl" />
              ) : null}
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-center lg:justify-end">
          {!layoutReady ? (
            <Skeleton
              className="rounded-xl"
              style={{
                height: phoneHeight,
                width: phoneWidth,
              }}
            />
          ) : (
            <div
              className="pointer-events-none relative overflow-hidden rounded-xl border bg-black"
              style={{
                height: phoneHeight,
                width: phoneWidth,
              }}
              aria-hidden
            >
              <video
                ref={cropVideoRef}
                className="size-full"
                style={{ objectFit }}
                src={src}
                muted
                playsInline
                preload="metadata"
              />
            </div>
          )}
        </div>
      </div>

      <MediaSettingsDrawer
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open)
          if (!open) {
            if (skipPreviewRevertRef.current) {
              skipPreviewRevertRef.current = false
            } else {
              setPreviewPresetId(configQuery.data?.outputPresetId ?? null)
            }
          }
        }}
        config={configQuery.data}
        saving={updateConfig.isPending}
        presets={presets}
        clips={clips}
        clipsLoading={clipsLoading}
        clipsWaiting={!clipsEnabled}
        clipsError={clipError}
        clipsToggling={updateClipMut.isPending}
        onOutputPresetPreview={setPreviewPresetId}
        onToggleClip={(clipId, selected) => {
          void onToggleClip(clipId, selected)
        }}
        onSave={({ patch, reanalyze }) => {
          if (patch.outputPresetId) {
            setPreviewPresetId(patch.outputPresetId)
          }
          skipPreviewRevertRef.current = true
          void updateConfig
            .mutateAsync({ patch, reanalyze })
            .then(() => setSettingsOpen(false))
            .catch(() => {
              skipPreviewRevertRef.current = false
            })
        }}
      />
    </main>
  )
}
