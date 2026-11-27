"use client"

import { queryKeys } from "@/lib/query/keys"
import type { RenderJob } from "@/lib/output-presets/types"
import { subscribeRealtime } from "@/lib/realtime/subscribe"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

/** Subscribe to media render realtime events. */
export function useRenderEvents(mediaId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!mediaId) return

    return subscribeRealtime(mediaId, (data) => {
      const event = parseRenderEvent(data)
      if (!event) return
      if (event.mediaFileId && event.mediaFileId !== mediaId) return

      const key = queryKeys.renders.byMedia(mediaId)

      if (event.type === "render.progress" && event.renderId) {
        queryClient.setQueryData<RenderJob[]>(key, (prev) => {
          if (!prev?.length) return prev
          return prev.map((r) =>
            r.id === event.renderId
              ? {
                  ...r,
                  status:
                    r.status === "queued" || r.status === "pending"
                      ? "running"
                      : r.status,
                  progress: Math.max(r.progress ?? 0, event.percent ?? 0),
                }
              : r
          )
        })
        return
      }

      void queryClient.invalidateQueries({ queryKey: key })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.steps(mediaId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.detail(mediaId),
      })
    })
  }, [mediaId, queryClient])
}

function parseRenderEvent(data: unknown): {
  type: string
  mediaFileId: string
  renderId: string
  percent?: number
} | null {
  if (!data || typeof data !== "object") return null
  const event = data as Record<string, unknown>
  const type =
    typeof event.type === "string" ? event.type.replace(/\.v\d+$/, "") : ""
  if (
    type !== "render.progress" &&
    type !== "render.completed" &&
    type !== "render.failed"
  ) {
    return null
  }

  const percentRaw = event.percent
  const percent =
    typeof percentRaw === "number"
      ? percentRaw
      : typeof percentRaw === "string"
        ? Number(percentRaw)
        : undefined

  return {
    type,
    mediaFileId: readString(event, "mediaFileId", "media_file_id", "mediaId"),
    renderId: readString(event, "renderId", "render_id"),
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
