import { parseApiError } from "@/lib/api-error"
import type { Timeline } from "./types"

export async function getMediaTimeline(mediaId: string): Promise<Timeline> {
  const response = await fetch(`/api/media/${mediaId}/timeline`, {
    method: "GET",
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to load timeline")
  }
  return response.json()
}

export async function previewMediaTimeline(
  mediaId: string
): Promise<Timeline> {
  const response = await fetch(`/api/media/${mediaId}/timeline/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to preview timeline")
  }
  return response.json()
}
