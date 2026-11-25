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
  timelineId: string
  kind: string
  strategy: string
  outputPresetId: string
  status: string
  progress: number
  createdAt: string
}
