"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query/keys"
import {
  createMediaFromURL,
  getMedia,
  getMediaConfiguration,
  getMediaPlayback,
  getMediaSteps,
  listMedia,
  listMediaClips,
  listMediaDetections,
  listMediaLLMArtifacts,
  mediaStreamUrl,
  reanalyzeMedia,
  updateClip,
  updateMediaConfiguration,
  uploadFile,
} from "./api"
import type { Clip, MediaConfigurationPatch } from "./types"

export function useMediaList() {
  return useQuery({
    queryKey: queryKeys.media.list(),
    queryFn: listMedia,
  })
}

export function useMedia(id: string | null) {
  return useQuery({
    queryKey: queryKeys.media.detail(id ?? ""),
    queryFn: () => getMedia(id as string),
    enabled: !!id,
  })
}

export function useMediaSteps(id: string | null) {
  return useQuery({
    queryKey: queryKeys.media.steps(id ?? ""),
    queryFn: () => getMediaSteps(id as string),
    enabled: !!id,
  })
}

function resultsEnabled(
  mediaId: string | null,
  mediaStatus: string | undefined,
  steps: { kind: string; status: string }[] | undefined
) {
  if (!mediaId) return false
  if (mediaStatus === "ready" || mediaStatus === "rendering") return true
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

export function useMediaClips(mediaId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.clips.byMedia(mediaId ?? ""),
    queryFn: () => listMediaClips(mediaId as string),
    enabled: !!mediaId && enabled,
  })
}

/** Toggle include-in-render for a proposed clip (LLM proposals stay; videos only if selected). */
export function useUpdateClip(mediaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { clipId: string; selected: boolean }) =>
      updateClip(input.clipId, { selected: input.selected }),
    onSuccess: (clip) => {
      const key = queryKeys.clips.byMedia(mediaId)
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

export function useCreateMediaFromURL() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (url: string) => createMediaFromURL(url),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.media.list(),
      }),
  })
}

export function useUploadMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadFile(file),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.media.list(),
      }),
  })
}
