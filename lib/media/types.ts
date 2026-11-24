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
