export type TimelineSegment = {
  id?: string
  segmentIndex: number
  mediaFileId: string
  sourceStartMs: number
  sourceEndMs: number
  outputStartMs: number
  outputEndMs: number
  removedBeforeReason?: string | null
}

export type TimelineDecision = {
  detectionId: string
  action: string
  origin: string
  reason?: string | null
}

export type Timeline = {
  id?: string
  version?: number
  status?: string
  fingerprint: string
  durationMs: number
  validatedAt?: string | null
  createdAt?: string | null
  segments: TimelineSegment[]
  decisions: TimelineDecision[]
}
