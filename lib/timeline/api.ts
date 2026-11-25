import { parseApiError } from "@/lib/api-error"
import type { Timeline } from "./types"

export async function getProjectTimeline(projectId: string): Promise<Timeline> {
  const response = await fetch(`/api/projects/${projectId}/timeline`, {
    method: "GET",
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to get timeline")
  }
  return response.json()
}

export async function previewProjectTimeline(
  projectId: string,
  mediaId?: string
): Promise<Timeline> {
  const response = await fetch(`/api/projects/${projectId}/timeline/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mediaId ? { mediaId } : {}),
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to preview timeline")
  }
  return response.json()
}

export async function validateProjectTimeline(
  projectId: string,
  version: number
): Promise<Timeline> {
  const response = await fetch(`/api/projects/${projectId}/timeline/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version }),
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to validate timeline")
  }
  return response.json()
}
