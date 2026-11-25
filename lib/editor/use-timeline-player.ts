"use client"

import { useCallback, useEffect, useRef } from "react"
import {
  findSegmentIndexBySource,
  firstSegmentAtOrAfter,
  outputToSource,
  sourceToOutput,
} from "./timeline-mapper"
import type { TimelineSegment } from "@/lib/timeline/types"

const FRAME_LEAD_MS = 40

export interface PlaybackTime {
  sourceMs: number
  outputMs: number
}

type TimeListener = (time: PlaybackTime) => void

function playbackOutputMs(segments: TimelineSegment[], sourceMs: number): number {
  const exact = sourceToOutput(segments, sourceMs)
  if (exact != null) return exact
  const next = firstSegmentAtOrAfter(segments, sourceMs)
  if (next) return next.outputStartMs
  return segments[segments.length - 1]?.outputEndMs ?? 0
}

function jumpTo(video: HTMLVideoElement, sourceMs: number) {
  const nextTime = Math.max(0, sourceMs / 1000)
  const apply = () => {
    if (Math.abs(video.currentTime - nextTime) < 0.02) return
    try {
      video.currentTime = nextTime
    } catch {
      // Ignore seek errors while media is still opening.
    }
  }
  if (video.readyState < 1) {
    video.addEventListener("loadedmetadata", apply, { once: true })
    return
  }
  apply()
}

function playSafe(video: HTMLVideoElement) {
  const result = video.play()
  if (result && typeof result.catch === "function") {
    result.catch(() => {})
  }
}

export function useTimelinePlayer(
  video: HTMLVideoElement | null,
  segments: TimelineSegment[],
  mediaUrl: string | null,
  timelineVersion: string | null
) {
  const segmentsRef = useRef(segments)
  const listenersRef = useRef(new Set<TimeListener>())
  const lastTimeRef = useRef<PlaybackTime>({ sourceMs: 0, outputMs: 0 })
  const previewUntilRef = useRef<number | null>(null)
  const appliedVersionRef = useRef<string | null>(null)
  const heldSourceMsRef = useRef(0)
  const heldPausedRef = useRef(true)
  const reloadingSrcRef = useRef(false)

  useEffect(() => {
    segmentsRef.current = segments
  }, [segments])

  const rememberTime = useCallback((el: HTMLVideoElement) => {
    const sourceMs = el.currentTime * 1000
    if (
      reloadingSrcRef.current &&
      sourceMs < 250 &&
      heldSourceMsRef.current > 1000
    ) {
      return
    }
    heldSourceMsRef.current = sourceMs
  }, [])

  const publish = useCallback(
    (el: HTMLVideoElement) => {
      rememberTime(el)
      const sourceMs = heldSourceMsRef.current
      const outputMs = playbackOutputMs(segmentsRef.current, sourceMs)
      const snapshot = { sourceMs, outputMs }
      lastTimeRef.current = snapshot
      for (const listener of listenersRef.current) listener(snapshot)
    },
    [rememberTime]
  )

  const restoreHeldTime = useCallback((el: HTMLVideoElement) => {
    const held = heldSourceMsRef.current
    if (held <= 250) return
    if (Math.abs(el.currentTime * 1000 - held) <= 250) return
    jumpTo(el, held)
    if (!heldPausedRef.current) playSafe(el)
  }, [])

  const enforcePlayback = useCallback((el: HTMLVideoElement) => {
    if (el.paused || el.seeking) return

    const sourceMs = el.currentTime * 1000
    const previewUntil = previewUntilRef.current
    if (previewUntil != null) {
      if (sourceMs >= previewUntil) {
        previewUntilRef.current = null
        el.pause()
      }
      return
    }

    const current = segmentsRef.current
    if (current.length === 0) return

    const index = findSegmentIndexBySource(current, sourceMs)
    if (index >= 0) {
      const segment = current[index]
      const next = current[index + 1]
      const playedMs = sourceMs - segment.sourceStartMs
      if (playedMs < FRAME_LEAD_MS) return

      if (next) {
        if (sourceMs < segment.sourceEndMs - FRAME_LEAD_MS) return
        jumpTo(el, next.sourceStartMs)
        return
      }

      if (sourceMs >= segment.sourceEndMs) {
        jumpTo(el, segment.sourceEndMs)
        el.pause()
      }
      return
    }

    const next = firstSegmentAtOrAfter(current, sourceMs)
    if (next) jumpTo(el, next.sourceStartMs)
    else el.pause()
  }, [])

  useEffect(() => {
    if (!video || !mediaUrl) return

    const onReady = () => {
      restoreHeldTime(video)
      reloadingSrcRef.current = false
    }

    const currentSrc = video.currentSrc || video.getAttribute("src") || ""
    const alreadyLoaded =
      currentSrc === mediaUrl ||
      currentSrc.endsWith(mediaUrl) ||
      (mediaUrl.startsWith("/") && currentSrc.includes(mediaUrl.split("?")[0]))

    if (!alreadyLoaded && video.getAttribute("src") !== mediaUrl) {
      const heldSeconds = Math.max(
        video.currentTime,
        heldSourceMsRef.current / 1000
      )
      if (heldSeconds > 0.25) heldSourceMsRef.current = heldSeconds * 1000
      reloadingSrcRef.current = heldSeconds > 0.25
      video.addEventListener("loadedmetadata", onReady, { once: true })
      video.src = mediaUrl
    }

    let frameHandle = 0
    let stopped = false
    const hasVideoFrame = typeof video.requestVideoFrameCallback === "function"

    const stopFrames = () => {
      if (hasVideoFrame) video.cancelVideoFrameCallback(frameHandle)
      else cancelAnimationFrame(frameHandle)
    }

    const onFrame = () => {
      if (stopped) return
      enforcePlayback(video)
      publish(video)
      if (video.paused) return
      if (hasVideoFrame) frameHandle = video.requestVideoFrameCallback(onFrame)
      else frameHandle = requestAnimationFrame(onFrame)
    }

    const startFrames = () => {
      stopFrames()
      if (hasVideoFrame) frameHandle = video.requestVideoFrameCallback(onFrame)
      else frameHandle = requestAnimationFrame(onFrame)
    }

    const onPlay = () => {
      heldPausedRef.current = false
      startFrames()
    }
    const onPause = () => {
      heldPausedRef.current = true
      stopFrames()
      publish(video)
    }
    const onSeeked = () => {
      reloadingSrcRef.current = false
      publish(video)
    }

    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)
    video.addEventListener("seeked", onSeeked)
    if (!video.paused) startFrames()
    else publish(video)

    return () => {
      stopped = true
      stopFrames()
      video.removeEventListener("loadedmetadata", onReady)
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("seeked", onSeeked)
    }
  }, [enforcePlayback, mediaUrl, publish, restoreHeldTime, video])

  useEffect(() => {
    if (!timelineVersion) return
    if (appliedVersionRef.current == null) {
      appliedVersionRef.current = timelineVersion
      if (video) publish(video)
      return
    }
    if (appliedVersionRef.current === timelineVersion) return
    appliedVersionRef.current = timelineVersion

    if (!video) return
    restoreHeldTime(video)
    if (Math.abs(video.currentTime * 1000 - heldSourceMsRef.current) <= 250) {
      publish(video)
    }
  }, [publish, restoreHeldTime, timelineVersion, video])

  const subscribe = useCallback((listener: TimeListener) => {
    listenersRef.current.add(listener)
    listener(lastTimeRef.current)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const seekSource = useCallback(
    (sourceMs: number) => {
      if (!video) return
      previewUntilRef.current = null
      jumpTo(video, sourceMs)
    },
    [video]
  )

  const seekAndPlay = useCallback(
    (sourceMs: number) => {
      if (!video) return
      previewUntilRef.current = null

      const current = segmentsRef.current
      let target = sourceMs
      if (current.length > 0 && findSegmentIndexBySource(current, sourceMs) < 0) {
        const next = firstSegmentAtOrAfter(current, sourceMs)
        target = next?.sourceStartMs ?? current[0].sourceStartMs
      }

      const start = () => {
        playSafe(video)
      }

      jumpTo(video, target)
      if (video.seeking) {
        video.addEventListener("seeked", start, { once: true })
      } else {
        start()
      }
    },
    [video]
  )

  const seekOutput = useCallback(
    (outputMs: number) => {
      seekSource(outputToSource(segmentsRef.current, outputMs))
    },
    [seekSource]
  )

  const previewSourceRange = useCallback(
    (startMs: number, endMs: number) => {
      if (!video) return
      previewUntilRef.current = endMs
      jumpTo(video, startMs)
      const start = () => playSafe(video)
      if (video.seeking) {
        video.addEventListener("seeked", start, { once: true })
      } else {
        start()
      }
    },
    [video]
  )

  const togglePlayback = useCallback(() => {
    if (!video) return
    if (!video.paused) {
      video.pause()
      return
    }

    const current = segmentsRef.current
    if (current.length > 0) {
      const sourceMs = video.currentTime * 1000
      const last = current[current.length - 1]
      if (last && sourceMs >= last.sourceEndMs - FRAME_LEAD_MS) {
        jumpTo(video, current[0].sourceStartMs)
      } else if (findSegmentIndexBySource(current, sourceMs) < 0) {
        const next = firstSegmentAtOrAfter(current, sourceMs)
        if (next) jumpTo(video, next.sourceStartMs)
        else jumpTo(video, current[0].sourceStartMs)
      }
    }

    previewUntilRef.current = null
    playSafe(video)
  }, [video])

  return {
    subscribe,
    seekSource,
    seekAndPlay,
    seekOutput,
    previewSourceRange,
    togglePlayback,
  }
}
