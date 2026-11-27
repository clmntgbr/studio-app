"use client"

import { queryKeys } from "@/lib/query/keys"
import type { Media, MediaStepsPayload } from "@/lib/media/types"
import { subscribeRealtime } from "@/lib/realtime/subscribe"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

const MEDIA_EVENT_TYPES = new Set([
  "media.step_started",
  "media.step_progress",
  "media.step_completed",
  "media.step_failed",
  "media.updated",
  "detections.updated",
])

/** Subscribe to media/pipeline realtime events; invalidate instead of polling. */
export function useMediaEvents(mediaId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!mediaId) return

    return subscribeRealtime(mediaId, (data) => {
      const event = parseMediaEvent(data)
      if (!event) return
      if (event.mediaId && event.mediaId !== mediaId) return

      if (event.type === "media.step_progress") {
        patchStepProgress(queryClient, mediaId, event.step, event.percent)
        return
      }

      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.list(),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.detail(mediaId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.steps(mediaId),
      })

      if (
        event.type === "media.updated" ||
        event.step === "proxy" ||
        event.step === "probe"
      ) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.media.playback(mediaId),
        })
      }

      if (
        event.type === "detections.updated" ||
        event.step === "silence" ||
        event.step === "text" ||
        event.step === "llm"
      ) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.media.detections(mediaId),
        })
      }

      if (
        event.type === "media.updated" ||
        event.step === "llm" ||
        event.step === "transcribe"
      ) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.media.llmArtifacts(mediaId),
        })
        void queryClient.invalidateQueries({
          queryKey: queryKeys.clips.byMedia(mediaId),
        })
      }
    })
  }, [mediaId, queryClient])
}

function patchStepProgress(
  queryClient: ReturnType<typeof useQueryClient>,
  mediaId: string,
  step: string,
  percent: number | undefined
) {
  if (!step) return
  const progress =
    percent == null || !Number.isFinite(percent)
      ? undefined
      : percent > 1
        ? percent / 100
        : percent

  queryClient.setQueryData<MediaStepsPayload>(
    queryKeys.media.steps(mediaId),
    (prev) => {
      if (!prev?.steps?.length) return prev
      return {
        ...prev,
        steps: prev.steps.map((s) =>
          s.kind === step
            ? {
                ...s,
                status:
                  s.status === "queued" || s.status === "pending"
                    ? "running"
                    : s.status,
                progress:
                  progress == null
                    ? s.progress
                    : Math.max(s.progress ?? 0, progress),
              }
            : s
        ),
      }
    }
  )

  queryClient.setQueryData<Media>(queryKeys.media.detail(mediaId), (prev) => {
    if (!prev?.steps?.length) return prev
    return {
      ...prev,
      steps: prev.steps.map((s) =>
        s.kind === step
          ? {
              ...s,
              status:
                s.status === "queued" || s.status === "pending"
                  ? "running"
                  : s.status,
              progress:
                progress == null
                  ? s.progress
                  : Math.max(s.progress ?? 0, progress),
            }
          : s
      ),
    }
  })
}

function parseMediaEvent(data: unknown): {
  type: string
  mediaId: string
  step: string
  percent?: number
} | null {
  if (!data || typeof data !== "object") return null
  const event = data as Record<string, unknown>
  const type =
    typeof event.type === "string" ? event.type.replace(/\.v\d+$/, "") : ""
  if (!MEDIA_EVENT_TYPES.has(type)) return null

  const percentRaw = event.percent
  const percent =
    typeof percentRaw === "number"
      ? percentRaw
      : typeof percentRaw === "string"
        ? Number(percentRaw)
        : undefined

  return {
    type,
    mediaId: readString(event, "mediaId", "media_id"),
    step: readString(event, "step"),
    percent: Number.isFinite(percent) ? percent : undefined,
  }
}

function readString(event: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = event[key]
    if (typeof value === "string" && value) return value
  }
  return ""
}
