export type EditDecisionType =
  | "silence"
  | "filler"
  | "repetition"
  | "false_start"
  | "sponsor"
  | "ad"
  | "manual"

export type EditAction = "keep" | "remove" | "suggest"

export type EditorDecision = {
  id: string
  type: EditDecisionType
  label: string | null
  sourceStartMs: number
  sourceEndMs: number
  automaticAction: EditAction | null
  effectiveAction: EditAction
  modifiedByUser: boolean
}
