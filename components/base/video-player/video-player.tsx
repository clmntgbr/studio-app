"use client"

/**
 * VideoPlayer API aligned with Untitled UI React
 * (@/components/base/video-player/video-player).
 *
 * Official package is PRO (`npx untitledui@latest add video-player` after login).
 * This local implementation mirrors the documented public API so the Watch page
 * can use the same import path until the PRO source is installed.
 */

import { cn } from "@/lib/utils"
import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"

export type VideoPlayerSize = "sm" | "md" | "lg"

export type VideoPlayerRef = {
  play: () => Promise<void>
  pause: () => void
  readonly paused: boolean
  readonly videoElement: HTMLVideoElement | null
}

export type VideoPlayerProps = {
  src: string
  type?: string
  autoPlay?: boolean
  thumbnailUrl?: string
  thumbnailAlt?: string
  showThumbnailOverlay?: boolean
  thumbnailButtonClassName?: string
  size?: VideoPlayerSize
  className?: string
  muted?: boolean
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  function VideoPlayer(
    {
      src,
      type: _type = "video/mp4",
      autoPlay = false,
      thumbnailUrl,
      thumbnailAlt = "",
      showThumbnailOverlay = false,
      thumbnailButtonClassName,
      size = "md",
      className,
      muted: mutedProp = false,
    },
    ref
  ) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const rootRef = useRef<HTMLDivElement>(null)
    const [paused, setPaused] = useState(true)
    const [muted, setMuted] = useState(mutedProp)
    const [volume, setVolume] = useState(1)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [playbackRate, setPlaybackRate] = useState(1)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showPoster, setShowPoster] = useState(!!thumbnailUrl)
    const [controlsVisible, setControlsVisible] = useState(true)
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useImperativeHandle(ref, () => ({
      play: async () => {
        const el = videoRef.current
        if (!el) return
        setShowPoster(false)
        await el.play()
      },
      pause: () => videoRef.current?.pause(),
      get paused() {
        return videoRef.current?.paused ?? true
      },
      get videoElement() {
        return videoRef.current
      },
    }))

    const bumpControls = useCallback(() => {
      setControlsVisible(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => {
        if (videoRef.current && !videoRef.current.paused) {
          setControlsVisible(false)
        }
      }, 2500)
    }, [])

    useEffect(() => {
      return () => {
        if (hideTimer.current) clearTimeout(hideTimer.current)
      }
    }, [])

    useEffect(() => {
      const onFs = () => setIsFullscreen(!!document.fullscreenElement)
      document.addEventListener("fullscreenchange", onFs)
      return () => document.removeEventListener("fullscreenchange", onFs)
    }, [])

    async function togglePlay() {
      const el = videoRef.current
      if (!el) return
      if (el.paused) {
        setShowPoster(false)
        await el.play()
      } else {
        el.pause()
      }
      bumpControls()
    }

    function toggleMute() {
      const el = videoRef.current
      if (!el) return
      el.muted = !el.muted
      setMuted(el.muted)
      bumpControls()
    }

    async function toggleFullscreen() {
      const root = rootRef.current
      if (!root) return
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await root.requestFullscreen()
      }
      bumpControls()
    }

    function cycleSpeed() {
      const rates = [0.75, 1, 1.25, 1.5, 2]
      const next =
        rates[(rates.indexOf(playbackRate) + 1) % rates.length] ?? 1
      const el = videoRef.current
      if (el) el.playbackRate = next
      setPlaybackRate(next)
      bumpControls()
    }

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      const el = videoRef.current
      if (!el) return
      const key = event.key.toLowerCase()
      if (key === " " || key === "k") {
        event.preventDefault()
        void togglePlay()
      } else if (key === "m") {
        event.preventDefault()
        toggleMute()
      } else if (key === "arrowleft") {
        event.preventDefault()
        el.currentTime = Math.max(0, el.currentTime - 10)
      } else if (key === "arrowright") {
        event.preventDefault()
        el.currentTime = Math.min(el.duration || 0, el.currentTime + 10)
      } else if (key === "arrowup") {
        event.preventDefault()
        el.volume = Math.min(1, el.volume + 0.1)
        el.muted = false
        setVolume(el.volume)
        setMuted(false)
      } else if (key === "arrowdown") {
        event.preventDefault()
        el.volume = Math.max(0, el.volume - 0.1)
        setVolume(el.volume)
      }
    }

    const showTime = size === "md" || size === "lg"
    const showSpeed = size === "lg"
    const showVolumeSlider = size === "lg"

    return (
      <div
        ref={rootRef}
        tabIndex={0}
        className={cn(
          "group relative overflow-hidden rounded-xl bg-black outline-none",
          className
        )}
        onKeyDown={onKeyDown}
        onMouseMove={bumpControls}
        onFocus={bumpControls}
      >
        <video
          ref={videoRef}
          className="size-full object-contain"
          playsInline
          preload="metadata"
          autoPlay={autoPlay}
          muted={muted}
          src={src}
          onClick={() => void togglePlay()}
          onDoubleClick={() => void toggleFullscreen()}
          onPlay={() => {
            setPaused(false)
            setShowPoster(false)
            bumpControls()
          }}
          onPause={() => {
            setPaused(true)
            setControlsVisible(true)
          }}
          onEnded={() => {
            setPaused(true)
            if (thumbnailUrl) setShowPoster(true)
            setControlsVisible(true)
          }}
          onTimeUpdate={() =>
            setCurrentTime(videoRef.current?.currentTime ?? 0)
          }
          onLoadedMetadata={() => {
            const el = videoRef.current
            if (!el) return
            setDuration(el.duration || 0)
            setVolume(el.volume)
          }}
          onVolumeChange={() => {
            const el = videoRef.current
            if (!el) return
            setMuted(el.muted)
            setVolume(el.volume)
          }}
        />

        {showPoster && thumbnailUrl ? (
          <button
            type="button"
            className={cn(
              "absolute inset-0 z-10 flex items-center justify-center",
              thumbnailButtonClassName
            )}
            onClick={() => void togglePlay()}
            aria-label="Play"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl}
              alt={thumbnailAlt}
              className="absolute inset-0 size-full object-cover"
            />
            {showThumbnailOverlay ? (
              <span className="absolute inset-0 bg-black/35" />
            ) : null}
            <span className="relative flex size-16 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
              <Play className="size-7 fill-current pl-0.5" />
            </span>
          </button>
        ) : null}

        {!showPoster && paused ? (
          <button
            type="button"
            className="absolute inset-0 z-10 flex items-center justify-center"
            onClick={() => void togglePlay()}
            aria-label="Play"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
              <Play className="size-6 fill-current pl-0.5" />
            </span>
          </button>
        ) : null}

        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-3 pt-10 pb-3 transition-opacity",
            controlsVisible || paused
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          )}
        >
          {showTime ? (
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.05}
              value={Math.min(currentTime, duration || 0)}
              className="mb-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/30 accent-white"
              onChange={(e) => {
                const el = videoRef.current
                if (!el) return
                el.currentTime = Number(e.target.value)
                setCurrentTime(el.currentTime)
              }}
              aria-label="Seek"
            />
          ) : null}

          <div className="flex items-center gap-2 text-white">
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-full hover:bg-white/15"
              onClick={() => void togglePlay()}
              aria-label={paused ? "Play" : "Pause"}
            >
              {paused ? (
                <Play className="size-4 fill-current" />
              ) : (
                <Pause className="size-4 fill-current" />
              )}
            </button>

            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-full hover:bg-white/15"
              onClick={toggleMute}
              aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? (
                <VolumeX className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </button>

            {showVolumeSlider ? (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/30 accent-white"
                onChange={(e) => {
                  const el = videoRef.current
                  if (!el) return
                  const next = Number(e.target.value)
                  el.volume = next
                  el.muted = next === 0
                  setVolume(next)
                  setMuted(next === 0)
                }}
                aria-label="Volume"
              />
            ) : null}

            {showTime ? (
              <span className="ml-1 text-xs tabular-nums text-white/90">
                {formatClock(currentTime)} / {formatClock(duration)}
              </span>
            ) : null}

            <div className="ml-auto flex items-center gap-1">
              {showSpeed ? (
                <button
                  type="button"
                  className="rounded-full px-2 py-1 text-xs font-medium hover:bg-white/15"
                  onClick={cycleSpeed}
                  aria-label={`Change playback speed. Current speed: ${playbackRate}x`}
                >
                  {playbackRate}x
                </button>
              ) : null}
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-full hover:bg-white/15"
                onClick={() => void toggleFullscreen()}
                aria-label={
                  isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
                }
              >
                {isFullscreen ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
)
