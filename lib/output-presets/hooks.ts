"use client"

import { queryKeys } from "@/lib/query/keys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createMediaRender,
  listOutputPresets,
  listMediaRenders,
} from "./api"
import type { RenderJob } from "./types"

export function useOutputPresets() {
  return useQuery({
    queryKey: queryKeys.outputPresets.list(),
    queryFn: listOutputPresets,
    staleTime: 5 * 60 * 1000,
  })
}

export function useMediaRenders(mediaId: string | null) {
  return useQuery({
    queryKey: queryKeys.renders.byMedia(mediaId ?? ""),
    queryFn: () => listMediaRenders(mediaId as string),
    enabled: !!mediaId,
    // Progress / completion via realtime (useRenderEvents) — no polling.
  })
}

export function useCreateMediaRender(mediaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      presetId: string
      kind?: string
      burnSubtitles?: boolean
      subtitleStyleId?: string
      force?: boolean
    }) => createMediaRender(mediaId, input),
    onSuccess: (render) => {
      const key = queryKeys.renders.byMedia(mediaId)
      queryClient.setQueryData<RenderJob[]>(key, (prev) => {
        const list = prev ?? []
        return [render, ...list.filter((r) => r.id !== render.id)]
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.steps(mediaId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.detail(mediaId),
      })
    },
  })
}
