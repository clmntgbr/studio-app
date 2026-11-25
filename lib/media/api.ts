import { parseApiError } from "@/lib/api-error"
import {
  Clip,
  CompletedPart,
  Detection,
  InitiateUploadResult,
  LLMArtifact,
  Media,
  MediaConfiguration,
  MediaConfigurationPatch,
  MediaPlayback,
  MediaStepsPayload,
} from "./types"

type Paginated<T> = { members: T[]; total: number }

export async function listProjectMedia(projectId: string): Promise<Media[]> {
  const response = await fetch(
    `/api/projects/${projectId}/media?limit=100`,
    { method: "GET" }
  )
  if (!response.ok) {
    throw await parseApiError(response, "Failed to list media")
  }
  const data = (await response.json()) as Paginated<Media>
  return data.members ?? []
}

export async function getMedia(id: string): Promise<Media> {
  const response = await fetch(`/api/media/${id}`, { method: "GET" })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to get media")
  }
  return response.json()
}

export async function getMediaSteps(id: string): Promise<MediaStepsPayload> {
  const response = await fetch(`/api/media/${id}/steps`, { method: "GET" })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to get media steps")
  }
  return response.json()
}

export async function listMediaLLMArtifacts(
  mediaId: string
): Promise<LLMArtifact[]> {
  const response = await fetch(`/api/media/${mediaId}/llm-artifacts`, {
    method: "GET",
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to list LLM artifacts")
  }
  return response.json()
}

export async function listMediaDetections(
  mediaId: string
): Promise<Detection[]> {
  const response = await fetch(`/api/media/${mediaId}/detections`, {
    method: "GET",
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to list detections")
  }
  return response.json()
}

export async function getMediaPlayback(
  mediaId: string,
  kind: "auto" | "proxy" | "source" = "auto"
): Promise<MediaPlayback> {
  const response = await fetch(
    `/api/media/${mediaId}/playback?kind=${encodeURIComponent(kind)}`,
    { method: "GET" }
  )
  if (!response.ok) {
    throw await parseApiError(response, "Failed to get playback URL")
  }
  return response.json()
}

/** Same-origin stream URL for <video src>. Avoids browser↔MinIO CORS. */
export function mediaStreamUrl(
  mediaId: string,
  kind: "auto" | "proxy" | "source" = "auto"
) {
  return `/api/media/${mediaId}/stream?kind=${encodeURIComponent(kind)}`
}

export async function getMediaConfiguration(
  mediaId: string
): Promise<MediaConfiguration> {
  const response = await fetch(`/api/media/${mediaId}/configuration`, {
    method: "GET",
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to get configuration")
  }
  return response.json()
}

export async function updateMediaConfiguration(
  mediaId: string,
  patch: MediaConfigurationPatch
): Promise<MediaConfiguration> {
  const response = await fetch(`/api/media/${mediaId}/configuration`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to update configuration")
  }
  return response.json()
}

export async function reanalyzeMedia(
  mediaId: string,
  steps: string[] = ["silence"]
): Promise<void> {
  const response = await fetch(`/api/media/${mediaId}/reanalyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ steps }),
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to reanalyze media")
  }
}

export async function listProjectClips(projectId: string): Promise<Clip[]> {
  const response = await fetch(`/api/projects/${projectId}/clips`, {
    method: "GET",
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to list clips")
  }
  return response.json()
}

export async function createMediaFromURL(
  projectId: string,
  url: string
): Promise<Media> {
  const response = await fetch(`/api/projects/${projectId}/media/from-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to create media from URL")
  }
  return response.json()
}

export async function initiateUpload(
  projectId: string,
  input: {
    filename: string
    mimeType?: string
    sizeBytes: number
    partCount: number
  }
): Promise<InitiateUploadResult> {
  const response = await fetch(`/api/projects/${projectId}/media/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to initiate upload")
  }
  return response.json()
}

export async function completeUpload(
  mediaId: string,
  uploadId: string,
  parts: CompletedPart[]
): Promise<Media> {
  const response = await fetch(`/api/media/${mediaId}/uploads/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, parts }),
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to complete upload")
  }
  return response.json()
}

const PART_SIZE = 5 * 1024 * 1024

/** Full browser multipart upload against MinIO presigned URLs. */
export async function uploadFileToProject(
  projectId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<Media> {
  const partCount = Math.max(1, Math.ceil(file.size / PART_SIZE))
  const init = await initiateUpload(projectId, {
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    partCount,
  })

  const completed: CompletedPart[] = []
  for (let i = 0; i < init.parts.length; i++) {
    const part = init.parts[i]
    const start = (part.partNumber - 1) * PART_SIZE
    const end = Math.min(start + PART_SIZE, file.size)
    const blob = file.slice(start, end)
    const put = await fetch(part.url, {
      method: "PUT",
      body: blob,
      headers: file.type ? { "Content-Type": file.type } : undefined,
    })
    if (!put.ok) {
      throw new Error(`Failed to upload part ${part.partNumber} (${put.status})`)
    }
    let etag = put.headers.get("etag") || put.headers.get("ETag") || ""
    etag = etag.replaceAll('"', "").trim()
    if (!etag) {
      throw new Error(
        `Missing ETag for part ${part.partNumber}. Ensure MinIO CORS exposes ETag (restart mc / minio-init).`
      )
    }
    completed.push({ partNumber: part.partNumber, etag: `"${etag}"` })
    onProgress?.(Math.round(((i + 1) / init.parts.length) * 100))
  }

  return completeUpload(init.mediaId, init.uploadId, completed)
}
