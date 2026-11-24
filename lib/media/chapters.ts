import type { ChapterHit, LLMArtifact } from "./types"

function asChapterHit(value: unknown): ChapterHit | null {
  if (!value || typeof value !== "object") return null
  const c = value as Record<string, unknown>
  const title = c.title ?? c.Title
  const sourceStartMs = c.sourceStartMs ?? c.SourceStartMs
  const sourceEndMs = c.sourceEndMs ?? c.SourceEndMs
  if (
    typeof title !== "string" ||
    typeof sourceStartMs !== "number" ||
    typeof sourceEndMs !== "number"
  ) {
    return null
  }
  return { title, sourceStartMs, sourceEndMs }
}

/** Pull chapter rows from llm-artifacts (kind=chapters or nested payload). */
export function chaptersFromArtifacts(artifacts: LLMArtifact[]): ChapterHit[] {
  const out: ChapterHit[] = []
  for (const a of artifacts) {
    const payload = a.payload
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const hit = asChapterHit(item)
        if (hit) out.push(hit)
      }
      continue
    }
    if (!payload || typeof payload !== "object") continue
    const record = payload as Record<string, unknown>
    const nested = record.chapters ?? record.Chapters
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const hit = asChapterHit(item)
        if (hit) out.push(hit)
      }
      continue
    }
    if (a.kind === "chapters") {
      const hit = asChapterHit(payload)
      if (hit) out.push(hit)
    }
  }
  return out
}
