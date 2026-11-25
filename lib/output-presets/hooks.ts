"use client"

import { queryKeys } from "@/lib/query/keys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createProjectRender,
  listOutputPresets,
  listProjectRenders,
} from "./api"
import type { RenderJob } from "./types"

export function useOutputPresets() {
  return useQuery({
    queryKey: queryKeys.outputPresets.list(),
    queryFn: listOutputPresets,
    staleTime: 5 * 60 * 1000,
  })
}

export function useProjectRenders(projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.renders.byProject(projectId ?? ""),
    queryFn: () => listProjectRenders(projectId as string),
    enabled: !!projectId,
    // Progress / completion via realtime (useRenderEvents) — no polling.
  })
}

export function useCreateProjectRender(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      presetId: string
      kind?: string
      burnSubtitles?: boolean
      subtitleStyleId?: string
      force?: boolean
    }) => createProjectRender(projectId, input),
    onSuccess: (render) => {
      const key = queryKeys.renders.byProject(projectId)
      queryClient.setQueryData<RenderJob[]>(key, (prev) => {
        const list = prev ?? []
        return [render, ...list.filter((r) => r.id !== render.id)]
      })
    },
  })
}
