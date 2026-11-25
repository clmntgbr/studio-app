import type { TimelineSegment } from "@/lib/timeline/types"

export const EMPTY_SEGMENTS: TimelineSegment[] = []

export function findSegmentIndexBySource(
  segments: TimelineSegment[],
  sourceMs: number
): number {
  let low = 0
  let high = segments.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const segment = segments[mid]
    if (sourceMs < segment.sourceStartMs) high = mid - 1
    else if (sourceMs >= segment.sourceEndMs) low = mid + 1
    else return mid
  }
  return -1
}

export function findSegmentByOutput(
  segments: TimelineSegment[],
  outputMs: number
): TimelineSegment | null {
  if (segments.length === 0) return null

  let low = 0
  let high = segments.length - 1

  while (low <= high) {
    const mid = (low + high) >> 1
    const segment = segments[mid]
    const isLast = mid === segments.length - 1
    const endsBefore = isLast
      ? outputMs > segment.outputEndMs
      : outputMs >= segment.outputEndMs

    if (outputMs < segment.outputStartMs) high = mid - 1
    else if (endsBefore) low = mid + 1
    else return segment
  }

  return null
}

export function firstSegmentAtOrAfter(
  segments: TimelineSegment[],
  sourceMs: number
): TimelineSegment | null {
  let low = 0
  let high = segments.length - 1
  let match = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (segments[mid].sourceStartMs >= sourceMs) {
      match = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }
  if (match === -1) return null
  return segments[match]
}

export function sourceToOutput(
  segments: TimelineSegment[],
  sourceMs: number
): number | null {
  const index = findSegmentIndexBySource(segments, sourceMs)
  if (index < 0) return null
  const segment = segments[index]
  return segment.outputStartMs + (sourceMs - segment.sourceStartMs)
}

export function outputToSource(
  segments: TimelineSegment[],
  outputMs: number
): number {
  const segment = findSegmentByOutput(segments, outputMs)
  if (segment) {
    return segment.sourceStartMs + (outputMs - segment.outputStartMs)
  }

  const last = segments[segments.length - 1]
  if (!last) return 0
  if (outputMs >= last.outputEndMs) return last.sourceEndMs
  return segments[0]?.sourceStartMs ?? 0
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}
