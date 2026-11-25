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
  input: {
    presetId: string
    kind?: string
    burnSubtitles?: boolean
    subtitleStyleId?: string
    force?: boolean
  }
): Promise<RenderJob> {
  const response = await fetch(`/api/projects/${projectId}/renders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      presetId: input.presetId,
      kind: input.kind ?? "master",
      burnSubtitles: input.burnSubtitles ?? false,
      force: input.force ?? true,
      ...(input.subtitleStyleId
        ? { subtitleStyleId: input.subtitleStyleId }
        : {}),
    }),
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to create render")
  }
  return response.json()
}

/** Ship one LLM/manual clip as its own vertical (or chosen preset) encode. */
export async function createClipRender(
  clipId: string,
  input?: {
    presetId?: string
    subtitleStyleId?: string
    burnSubtitles?: boolean
    force?: boolean
  }
): Promise<RenderJob> {
  const response = await fetch(`/api/clips/${clipId}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(input?.presetId ? { presetId: input.presetId } : {}),
      ...(input?.subtitleStyleId
        ? { subtitleStyleId: input.subtitleStyleId }
        : {}),
      burnSubtitles: input?.burnSubtitles ?? false,
      force: input?.force ?? true,
    }),
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to create clip render")
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

/** Same-origin API proxy URL (streams the file; no MinIO presign). */
export function renderDownloadURL(renderId: string, part?: number): string {
  const q = part && part > 0 ? `?part=${part}` : ""
  return `/api/renders/${renderId}/download${q}`
}

/** Triggers a browser download through the authenticated API proxy. */
export async function downloadRender(
  renderId: string,
  part?: number
): Promise<void> {
  const response = await fetch(renderDownloadURL(renderId, part), {
    method: "GET",
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to download render")
  }
  const blob = await response.blob()
  const cd = response.headers.get("content-disposition") ?? ""
  const match = /filename="?([^";]+)"?/i.exec(cd)
  const filename =
    match?.[1] ??
    (part && part > 0
      ? `render-${renderId}-part-${String(part).padStart(2, "0")}.mp4`
      : `render-${renderId}.mp4`)
  const objectURL = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objectURL
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectURL)
}
