export type MediaStep = {
  kind: string
  status: string
  progress: number
  errorMessage?: string | null
  queuedAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  durationMs?: number | null
}

export type MediaStepRun = {
  id: string
  kind: string
  attempt: number
  status: string
  startedAt: string
  completedAt?: string | null
  durationMs?: number | null
  errorMessage?: string | null
  createdAt: string
}

export type Media = {
  id: string
  projectId: string
  position: number
  sourceKind: string
  sourceUrl?: string | null
  title?: string | null
  originalFilename?: string | null
  storageKey?: string | null
  mimeType?: string | null
  durationMs?: number | null
  width?: number | null
  height?: number | null
  status: string
  sizeBytes?: number | null
  steps: MediaStep[]
  createdAt: string
  updatedAt: string
}

export type MediaStepsPayload = {
  steps: MediaStep[]
  runs: MediaStepRun[]
}

export type InitiateUploadResult = {
  mediaId: string
  uploadId: string
  bucket: string
  key: string
  parts: { partNumber: number; url: string }[]
}

export type CompletedPart = {
  partNumber: number
  etag: string
}

export type LLMArtifact = {
  id: string
  mediaFileId: string
  kind: string
  payload: unknown
  provider?: string | null
  createdAt: string
}

export type Detection = {
  id: string
  mediaFileId: string
  kind: string
  sourceStartMs: number
  sourceEndMs: number
  confidence?: number | null
  detector: string
  firstWordIndex?: number | null
  lastWordIndex?: number | null
  payload: unknown
  createdAt: string
}

export type Clip = {
  id: string
  projectId: string
  mediaFileId: string
  sourceStartMs: number
  sourceEndMs: number
  origin: string
  score?: number | null
  hook?: string | null
  reason?: string | null
  title?: string | null
  description?: string | null
  hashtags: string[]
  selected: boolean
  createdAt: string
}

export type ChapterHit = {
  title: string
  sourceStartMs: number
  sourceEndMs: number
}

export type MediaPlayback = {
  url: string
  kind: string
  expiresIn: number
}

export type MediaConfiguration = {
  mediaFileId: string
  silenceEnabled: boolean
  thresholdMode: string
  silenceThresholdDb?: number | null
  detectionLevel: string
  silenceMinDurationMs: number
  paddingBeforeMs: number
  paddingAfterMs: number
  speechMinDurationMs: number
  fillersEnabled: boolean
  repetitionsEnabled: boolean
  falseStartsEnabled: boolean
  sponsorsAction: string
  adsAction: string
  language?: string | null
  updatedAt: string
}

export type MediaConfigurationPatch = {
  silenceEnabled?: boolean
  thresholdMode?: string
  silenceThresholdDb?: number | null
  detectionLevel?: string
  silenceMinDurationMs?: number
  paddingBeforeMs?: number
  paddingAfterMs?: number
  speechMinDurationMs?: number
  fillersEnabled?: boolean
  repetitionsEnabled?: boolean
  falseStartsEnabled?: boolean
  sponsorsAction?: string
  adsAction?: string
  language?: string | null
}
