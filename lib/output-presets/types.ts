export type OutputPreset = {
  id: string
  name: string
  width: number
  height: number
  aspectRatio: string
  cropMode: string
  videoCodec: string
  audioCodec: string
  fps?: number | null
  loudnessLufs?: number | null
  settings: unknown
}

export type RenderJob = {
  id: string
  projectId: string
  mediaFileId: string
  timelineId: string
  kind: string
  strategy: string
  outputPresetId: string
  clipId?: string | null
  status: string
  progress: number
  errorMessage?: string | null
  storageKey?: string | null
  outputParts?: string[]
  durationMs?: number | null
  sizeBytes?: number | null
  createdAt: string
  completedAt?: string | null
}
