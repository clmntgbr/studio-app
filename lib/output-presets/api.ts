import { parseApiError } from "@/lib/api-error"
import type { OutputPreset, RenderJob } from "./types"

export async function listOutputPresets(): Promise<OutputPreset[]> {
  const response = await fetch("/api/output-presets", { method: "GET" })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to list output presets")
  }
  return response.json()
}

export async function createProjectRender(
  projectId: string,
  input: { presetId: string; kind?: string }
): Promise<RenderJob> {
  const response = await fetch(`/api/projects/${projectId}/renders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      presetId: input.presetId,
      kind: input.kind ?? "master",
    }),
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to create render")
  }
  return response.json()
}

export async function listProjectRenders(
  projectId: string
): Promise<RenderJob[]> {
  const response = await fetch(`/api/projects/${projectId}/renders`, {
    method: "GET",
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to list renders")
  }
  const data = await response.json()
  return Array.isArray(data) ? data : (data.members ?? [])
}
