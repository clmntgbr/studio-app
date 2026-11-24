"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query/keys"
import {
  createMediaFromURL,
  getMedia,
  getMediaSteps,
  listMediaDetections,
  listMediaLLMArtifacts,
  listProjectClips,
  listProjectMedia,
  uploadFileToProject,
} from "./api"

const PROCESSING = new Set([
  "pending",
  "uploading",
  "fetching",
  "processing",
  "queued",
])

export function useProjectMedia(projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.media.byProject(projectId ?? ""),
    queryFn: () => listProjectMedia(projectId as string),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const items = query.state.data
      if (!items?.length) return false
      return items.some((m) => PROCESSING.has(m.status)) ? 3000 : false
    },
  })
}

export function useMedia(id: string | null) {
  return useQuery({
    queryKey: queryKeys.media.detail(id ?? ""),
    queryFn: () => getMedia(id as string),
    enabled: !!id,
    refetchInterval: (query) => {
      const m = query.state.data
      if (!m) return false
      return PROCESSING.has(m.status) ? 2500 : false
    },
  })
}

export function useMediaSteps(id: string | null) {
  return useQuery({
    queryKey: queryKeys.media.steps(id ?? ""),
    queryFn: () => getMediaSteps(id as string),
    enabled: !!id,
    refetchInterval: (query) => {
      const steps = query.state.data?.steps
      if (!steps?.length) return 4000
      const busy = steps.some(
        (s) => s.status === "queued" || s.status === "running"
      )
      return busy ? 2500 : false
    },
  })
}

function resultsEnabled(
  mediaId: string | null,
  mediaStatus: string | undefined,
  steps: { kind: string; status: string }[] | undefined
) {
  if (!mediaId) return false
  if (mediaStatus === "ready") return true
  if (!steps?.length) return false
  return steps.some(
    (s) =>
      (s.kind === "llm" || s.kind === "transcribe" || s.kind === "text") &&
      s.status === "completed"
  )
}

export function useMediaLLMArtifacts(
  mediaId: string | null,
  opts?: { mediaStatus?: string; steps?: { kind: string; status: string }[] }
) {
  return useQuery({
    queryKey: queryKeys.media.llmArtifacts(mediaId ?? ""),
    queryFn: () => listMediaLLMArtifacts(mediaId as string),
    enabled: resultsEnabled(mediaId, opts?.mediaStatus, opts?.steps),
  })
}

export function useMediaDetections(
  mediaId: string | null,
  opts?: { mediaStatus?: string; steps?: { kind: string; status: string }[] }
) {
  return useQuery({
    queryKey: queryKeys.media.detections(mediaId ?? ""),
    queryFn: () => listMediaDetections(mediaId as string),
    enabled: resultsEnabled(mediaId, opts?.mediaStatus, opts?.steps),
  })
}

export function useProjectClips(projectId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.clips.byProject(projectId ?? ""),
    queryFn: () => listProjectClips(projectId as string),
    enabled: !!projectId && enabled,
  })
}

export function useCreateMediaFromURL(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (url: string) => createMediaFromURL(projectId, url),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.media.byProject(projectId),
      }),
  })
}

export function useUploadMedia(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadFileToProject(projectId, file),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.media.byProject(projectId),
      }),
  })
}
