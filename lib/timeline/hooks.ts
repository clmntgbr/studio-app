"use client"

import { queryKeys } from "@/lib/query/keys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getMediaTimeline, previewMediaTimeline } from "./api"

export function useMediaTimeline(mediaId: string | null) {
  return useQuery({
    queryKey: queryKeys.timeline.byMedia(mediaId ?? ""),
    queryFn: () => getMediaTimeline(mediaId as string),
    enabled: !!mediaId,
  })
}

export function usePreviewTimeline(mediaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => previewMediaTimeline(mediaId),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.timeline.byMedia(mediaId), data)
    },
  })
}
