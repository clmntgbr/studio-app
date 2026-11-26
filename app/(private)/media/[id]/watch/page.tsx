"use client"

import {
  VideoPlayer,
  type VideoPlayerRef,
} from "@/components/base/video-player/video-player"
import { MediaSettingsDrawer } from "@/components/media/media-settings-drawer"
import { Button } from "@/components/ui/button"
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
import { useParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

export default function MediaWatchPage() {
  const params = useParams<{ id: string }>()
  const mediaId = params.id
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [clipError, setClipError] = useState<string | null>(null)

  const { data: media } = useMedia(mediaId)
  const { data: stepsPayload } = useMediaSteps(mediaId)
  const steps = stepsPayload?.steps ?? media?.steps ?? []
  const projectId = media?.projectId ?? null
  useMediaEvents(projectId, mediaId)

  const configQuery = useMediaConfiguration(mediaId)
  const updateConfig = useUpdateMediaConfiguration(mediaId)
  const updateClipMut = useUpdateClip(projectId ?? "")
  const playback = useMediaPlayback(mediaId, !!mediaId)

  const playerRef = useRef<VideoPlayerRef>(null)
  const mainStageRef = useRef<HTMLDivElement>(null)
  const [mainVideo, setMainVideo] = useState<HTMLVideoElement | null>(null)
  const [cropVideo, setCropVideo] = useState<HTMLVideoElement | null>(null)
  const [cropHeight, setCropHeight] = useState<number | null>(null)

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

  // Match crop height to the large player; width follows 9:16.
  useEffect(() => {
    const stage = mainStageRef.current
    if (!stage) return
    const update = () => {
      const h = Math.round(stage.getBoundingClientRect().height)
      if (h > 0) setCropHeight(h)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [playback.data?.url])

  // Capture the main <video> once VideoPlayer has mounted (ref is not ready on first paint).
  useEffect(() => {
    if (!playback.data?.url) {
      setMainVideo(null)
      return
    }
    let cancelled = false
    const attach = () => {
      const el = playerRef.current?.videoElement ?? null
      if (!cancelled) setMainVideo(el)
      if (!el && !cancelled) {
        requestAnimationFrame(attach)
      }
    }
    attach()
    return () => {
      cancelled = true
    }
  }, [playback.data?.url])

  // Crop follows the large player: play / pause / seek / rate. Large player is the leader.
  useEffect(() => {
    if (!mainVideo || !cropVideo) return

    cropVideo.muted = true
    cropVideo.playsInline = true
    cropVideo.playbackRate = mainVideo.playbackRate

    const syncTime = (force = false) => {
      const drift = Math.abs(cropVideo.currentTime - mainVideo.currentTime)
      if (force || drift > 0.3) {
        try {
          cropVideo.currentTime = mainVideo.currentTime
        } catch {
          // ignore seek before metadata
        }
      }
    }

    const followPlay = () => {
      syncTime(true)
      void cropVideo.play().catch(() => undefined)
    }
    const followPause = () => {
      cropVideo.pause()
    }
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
  }, [mainVideo, cropVideo])

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
        <div ref={mainStageRef} className="min-w-0 flex-1">
          {src ? (
            <VideoPlayer
              ref={playerRef}
              src={src}
              size="md"
              className="aspect-video w-full min-h-[200px]"
            />
          ) : (
            <div className="bg-muted/40 flex aspect-video w-full items-center justify-center rounded-xl border text-sm text-muted-foreground">
              Loading video…
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-center lg:justify-end">
          <div
            className="pointer-events-none relative overflow-hidden rounded-xl border bg-black"
            style={{
              height: cropHeight ?? undefined,
              aspectRatio: "9 / 16",
              width: cropHeight ? cropHeight * (9 / 16) : undefined,
              maxWidth: "100%",
            }}
            aria-hidden
          >
            {src ? (
              <video
                ref={setCropVideo}
                className="size-full object-cover"
                src={src}
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-xs text-white/60">
                …
              </div>
            )}
          </div>
        </div>
      </div>

      <MediaSettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        config={configQuery.data}
        saving={updateConfig.isPending}
        clips={clips}
        clipsLoading={clipsLoading}
        clipsWaiting={!clipsEnabled}
        clipsError={clipError}
        clipsToggling={updateClipMut.isPending}
        onToggleClip={(clipId, selected) => {
          void onToggleClip(clipId, selected)
        }}
        onSave={({ patch, reanalyze }) => {
          void updateConfig
            .mutateAsync({ patch, reanalyze })
            .then(() => setSettingsOpen(false))
        }}
      />
    </main>
  )
}
