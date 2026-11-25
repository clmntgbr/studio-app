/** Encode / decode media_configuration.master_split (one DB value). */

export type MasterSplitMode = "off" | "parts" | "duration"

export type MasterSplitState = {
  mode: MasterSplitMode
  parts: number
  /** Minutes when mode=duration */
  durationMin: number
}

export function parseMasterSplit(raw: string | null | undefined): MasterSplitState {
  const s = (raw ?? "").trim()
  if (!s || s === "off" || s === "none") {
    return { mode: "off", parts: 3, durationMin: 10 }
  }
  const partsMatch = /^parts:(\d+)$/i.exec(s)
  if (partsMatch) {
    return {
      mode: "parts",
      parts: Math.max(2, Math.min(50, Number(partsMatch[1]) || 3)),
      durationMin: 10,
    }
  }
  const durMatch = /^durationMs:(\d+)$/i.exec(s)
  if (durMatch) {
    const ms = Number(durMatch[1]) || 600_000
    return {
      mode: "duration",
      parts: 3,
      durationMin: Math.max(1, Math.min(60, Math.round(ms / 60_000))),
    }
  }
  return { mode: "off", parts: 3, durationMin: 10 }
}

export function formatMasterSplit(state: MasterSplitState): string {
  if (state.mode === "parts") {
    const n = Math.max(2, Math.min(50, Math.round(state.parts) || 2))
    return `parts:${n}`
  }
  if (state.mode === "duration") {
    const min = Math.max(1, Math.min(60, Math.round(state.durationMin) || 10))
    return `durationMs:${min * 60_000}`
  }
  return ""
}
