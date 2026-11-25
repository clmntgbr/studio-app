"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query/keys"
import {
  createMediaFromURL,
  getMedia,
  getMediaConfiguration,
  getMediaPlayback,
  getMediaSteps,
  listMediaDetections,
  listMediaLLMArtifacts,
  listProjectClips,
  listProjectMedia,
  mediaStreamUrl,
  reanalyzeMedia,
  updateClip,
  updateMediaConfiguration,
  uploadFileToProject,
} from "./api"
import type { Clip, MediaConfigurationPatch } from "./types"

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

/** Toggle include-in-Ship for a proposed clip (LLM proposals stay; videos only if selected). */
export function useUpdateClip(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { clipId: string; selected: boolean }) =>
      updateClip(input.clipId, { selected: input.selected }),
    onSuccess: (clip) => {
      const key = queryKeys.clips.byProject(projectId)
      queryClient.setQueryData<Clip[]>(key, (prev) => {
        const list = prev ?? []
        return list.map((c) => (c.id === clip.id ? clip : c))
      })
    },
  })
}

export function useMediaPlayback(mediaId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.media.playback(mediaId ?? ""),
    queryFn: async () => {
      // Prefer proxy; fall back to original source while proxy encodes.
      const playback = await getMediaPlayback(mediaId as string, "auto")
      const kind =
        playback.kind === "source" || playback.kind === "proxy"
          ? playback.kind
          : "auto"
      return {
        url: mediaStreamUrl(mediaId as string, kind),
        kind,
        expiresIn: playback.expiresIn ?? 3600,
      }
    },
    enabled: !!mediaId && enabled,
    staleTime: 10 * 60 * 1000,
    // Upgrade to proxy once ready without blocking early edit.
    refetchInterval: (query) =>
      query.state.data?.kind === "source" ? 5_000 : false,
  })
}

export function useMediaConfiguration(mediaId: string | null) {
  return useQuery({
    queryKey: queryKeys.media.configuration(mediaId ?? ""),
    queryFn: () => getMediaConfiguration(mediaId as string),
    enabled: !!mediaId,
  })
}

type UpdateMediaConfigurationInput =
  | MediaConfigurationPatch
  | { patch: MediaConfigurationPatch; reanalyze?: boolean }

function normalizeConfigUpdate(input: UpdateMediaConfigurationInput): {
  patch: MediaConfigurationPatch
  reanalyze: boolean
} {
  if (input && typeof input === "object" && "patch" in input) {
    return {
      patch: input.patch,
      reanalyze: input.reanalyze === true,
    }
  }
  return { patch: input, reanalyze: false }
}

export function useUpdateMediaConfiguration(mediaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateMediaConfigurationInput) => {
      const { patch, reanalyze } = normalizeConfigUpdate(input)
      const cfg = await updateMediaConfiguration(mediaId, patch)
      // Silence drawer only — ship prefs must not re-trigger the pipeline.
      if (reanalyze) {
        await reanalyzeMedia(mediaId, ["silence", "text"])
      }
      return cfg
    },
    onSuccess: (_cfg, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.media.configuration(mediaId),
      })
      const { reanalyze } = normalizeConfigUpdate(input)
      if (reanalyze) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.media.steps(mediaId),
        })
        void queryClient.invalidateQueries({
          queryKey: queryKeys.media.detections(mediaId),
        })
      }
    },
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
