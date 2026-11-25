"use client"

import { queryKeys } from "@/lib/query/keys"
import type { RenderJob } from "@/lib/output-presets/types"
import { subscribeRealtime } from "@/lib/realtime/subscribe"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

/** Subscribe to project render realtime events; no polling. */
export function useRenderEvents(projectId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!projectId) return

    return subscribeRealtime(projectId, (data) => {
      const event = parseRenderEvent(data)
      if (!event) return
      if (event.projectId && event.projectId !== projectId) return

      const key = queryKeys.renders.byProject(projectId)

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

      // completed / failed — refresh list from API once
      void queryClient.invalidateQueries({ queryKey: key })
    })
  }, [projectId, queryClient])
}

function parseRenderEvent(data: unknown): {
  type: string
  projectId: string
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
    projectId: readString(event, "projectId", "project_id"),
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
