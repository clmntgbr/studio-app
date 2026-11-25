import type { Detection } from "@/lib/media/types"
import type { TimelineDecision } from "@/lib/timeline/types"
import type { EditAction, EditDecisionType, EditorDecision } from "./types"

const KNOWN_TYPES = new Set<EditDecisionType>([
  "silence",
  "filler",
  "repetition",
  "false_start",
  "sponsor",
  "ad",
  "manual",
])

function asDecisionType(kind: string): EditDecisionType {
  if (KNOWN_TYPES.has(kind as EditDecisionType)) {
    return kind as EditDecisionType
  }
  return "manual"
}

function asAction(action: string | undefined): EditAction | null {
  if (action === "keep" || action === "remove" || action === "suggest") {
    return action
  }
  return null
}

/** Join detections with timeline decisions for lane rendering. */
export function buildEditorDecisions(
  detections: Detection[],
  decisions: TimelineDecision[]
): EditorDecision[] {
  const byId = new Map(decisions.map((d) => [d.detectionId, d]))

  return detections.flatMap((detection) => {
    const decision = byId.get(detection.id)
    const effective = asAction(decision?.action)
    if (!effective) return []

    const type = asDecisionType(detection.kind)
    return [
      {
        id: detection.id,
        type,
        label: decision?.reason ?? detection.kind,
        sourceStartMs: detection.sourceStartMs,
        sourceEndMs: detection.sourceEndMs,
        automaticAction: effective,
        effectiveAction: effective,
        modifiedByUser:
          decision?.origin === "user" || decision?.origin === "override",
      },
    ]
  })
}
