"use client"

import { queryKeys } from "@/lib/query/keys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getProjectTimeline,
  previewProjectTimeline,
  validateProjectTimeline,
} from "./api"

export function useProjectTimeline(projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.timeline.byProject(projectId ?? ""),
    queryFn: () => getProjectTimeline(projectId as string),
    enabled: !!projectId,
    retry: (failureCount, error) => {
      const msg = error instanceof Error ? error.message : ""
      if (msg.toLowerCase().includes("not found")) return false
      return failureCount < 2
    },
  })
}

export function usePreviewTimeline(projectId: string) {
  return useMutation({
    mutationFn: (mediaId?: string) =>
      previewProjectTimeline(projectId, mediaId),
  })
}

export function useValidateTimeline(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (version: number) =>
      validateProjectTimeline(projectId, version),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.timeline.byProject(projectId), data)
    },
  })
}
