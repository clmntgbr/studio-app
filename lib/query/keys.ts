export const queryKeys = {
  user: {
    all: ["user"] as const,
    me: ["user", "me"] as const,
  },
  projects: {
    all: ["projects"] as const,
    lists: () => [...queryKeys.projects.all, "list"] as const,
    list: () => [...queryKeys.projects.lists()] as const,
    detail: (id: string) => [...queryKeys.projects.all, id] as const,
  },
  media: {
    all: ["media"] as const,
    byProject: (projectId: string) =>
      [...queryKeys.media.all, "project", projectId] as const,
    detail: (id: string) => [...queryKeys.media.all, id] as const,
    steps: (id: string) => [...queryKeys.media.detail(id), "steps"] as const,
    llmArtifacts: (id: string) =>
      [...queryKeys.media.detail(id), "llm-artifacts"] as const,
    detections: (id: string) =>
      [...queryKeys.media.detail(id), "detections"] as const,
    playback: (id: string) =>
      [...queryKeys.media.detail(id), "playback"] as const,
    configuration: (id: string) =>
      [...queryKeys.media.detail(id), "configuration"] as const,
  },
  clips: {
    all: ["clips"] as const,
    byProject: (projectId: string) =>
      [...queryKeys.clips.all, "project", projectId] as const,
  },
  timeline: {
    all: ["timeline"] as const,
    byMedia: (mediaId: string) =>
      [...queryKeys.timeline.all, "media", mediaId] as const,
  },
  outputPresets: {
    all: ["output-presets"] as const,
    list: () => [...queryKeys.outputPresets.all, "list"] as const,
  },
  renders: {
    all: ["renders"] as const,
    byMedia: (mediaId: string) =>
      [...queryKeys.renders.all, "media", mediaId] as const,
  },
}
