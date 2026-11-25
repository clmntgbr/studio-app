"use client"

import { queryKeys } from "@/lib/query/keys"
import { subscribeRealtime } from "@/lib/realtime/subscribe"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

export function useTimelineEvents(
  projectId: string,
  mediaId: string | null,
  onUpdated: () => void
) {
  const queryClient = useQueryClient()
  const onUpdatedRef = useRef(onUpdated)

  useEffect(() => {
    onUpdatedRef.current = onUpdated
  }, [onUpdated])

  useEffect(() => {
    if (!projectId || !mediaId) return

    return subscribeRealtime(projectId, (data) => {
      const event = parseTimelineUpdated(data)
      if (!event) return
      if (event.projectId && event.projectId !== projectId) return
      if (event.mediaId && event.mediaId !== mediaId) return

      onUpdatedRef.current()
      void queryClient.invalidateQueries({
        queryKey: queryKeys.timeline.byProject(projectId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.detections(mediaId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.configuration(mediaId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.steps(mediaId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.detail(mediaId),
      })
    })
  }, [mediaId, projectId, queryClient])
}

function parseTimelineUpdated(
  data: unknown
): { projectId: string; mediaId: string } | null {
  if (!data || typeof data !== "object") return null
  const event = data as Record<string, unknown>
  const type =
    typeof event.type === "string" ? event.type.replace(/\.v\d+$/, "") : ""
  if (type !== "timeline.updated") return null

  return {
    projectId: readString(event, "projectId", "project_id"),
    mediaId: readString(event, "mediaId", "media_id"),
  }
}

function readString(event: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = event[key]
    if (typeof value === "string" && value) return value
  }
  return ""
}
