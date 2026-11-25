"use client"

import { queryKeys } from "@/lib/query/keys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createProjectRender,
  listOutputPresets,
  listProjectRenders,
} from "./api"

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
    refetchInterval: (query) => {
      const items = query.state.data
      if (!items?.length) return false
      const busy = items.some(
        (r) =>
          r.status === "queued" ||
          r.status === "running" ||
          r.status === "pending"
      )
      return busy ? 2500 : false
    },
  })
}

export function useCreateProjectRender(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { presetId: string; kind?: string }) =>
      createProjectRender(projectId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.renders.byProject(projectId),
      })
    },
  })
}
