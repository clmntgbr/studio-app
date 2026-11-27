"use client"

import type { MediaStep } from "@/lib/media/types"

const PIPELINE: { id: string; label: string; kinds: string[] }[] = [
  { id: "vod", label: "VOD", kinds: ["fetch", "probe", "audio", "proxy"] },
  { id: "recut", label: "RECUT", kinds: ["silence", "transcribe", "text"] },
  { id: "reframe", label: "REFRAME", kinds: ["reframe"] },
  { id: "dub", label: "DUB", kinds: [] },
  { id: "caption", label: "CAPTION", kinds: ["llm"] },
  { id: "render", label: "RENDER", kinds: ["render"] },
]

function stepState(
  kinds: string[],
  steps: MediaStep[] | undefined,
  forced?: "active" | "done" | "idle"
): "active" | "done" | "idle" {
  if (forced) return forced
  if (!kinds.length || !steps?.length) return "idle"
  const matched = steps.filter((s) => kinds.includes(s.kind))
  if (!matched.length) return "idle"
  if (matched.some((s) => s.status === "running" || s.status === "queued")) {
    return "active"
  }
  if (matched.every((s) => s.status === "completed")) return "done"
  if (matched.some((s) => s.status === "completed")) return "active"
  return "idle"
}

export function PipelineSteps({
  steps,
  timelineReady,
}: {
  steps?: MediaStep[]
  timelineReady: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PIPELINE.map((stage, index) => {
        let forced: "active" | "done" | "idle" | undefined
        if (stage.id === "recut" && timelineReady) forced = "done"
        const state = stepState(stage.kinds, steps, forced)
        return (
          <div key={stage.id} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span className="text-[10px] text-[#3a4154]">→</span>
            ) : null}
            <span
              className="cf-step"
              data-active={state === "active"}
              data-done={state === "done"}
            >
              {stage.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
