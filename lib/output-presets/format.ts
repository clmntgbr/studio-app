import type { OutputPreset } from "./types"

export type FormatFamily = "original" | "landscape" | "portrait" | "square" | "audio" | "other"

export function formatFamily(preset: OutputPreset): FormatFamily {
  if (preset.videoCodec === "none" || (preset.width === 0 && preset.height === 0)) {
    return "audio"
  }
  if (preset.aspectRatio === "16:9") return "landscape"
  if (preset.aspectRatio === "9:16" || preset.aspectRatio === "4:5") return "portrait"
  if (preset.aspectRatio === "1:1") return "square"
  return "other"
}

export function formatLabel(preset: OutputPreset): string {
  const family = formatFamily(preset)
  switch (family) {
    case "audio":
      return "Audio"
    case "landscape":
      return preset.cropMode === "none" ? "Paysage / Original" : "Paysage"
    case "portrait":
      return "Vertical"
    case "square":
      return "Carré"
    default:
      return preset.name
  }
}

export function previewAspectStyle(
  preset: OutputPreset | null,
  mediaWidth?: number | null,
  mediaHeight?: number | null
): { aspectRatio: string; objectFit: "contain" | "cover" } {
  if (!preset) {
    return { aspectRatio: "16 / 9", objectFit: "contain" }
  }
  if (formatFamily(preset) === "audio") {
    return { aspectRatio: "16 / 9", objectFit: "contain" }
  }
  if (preset.cropMode === "none" && mediaWidth && mediaHeight) {
    return {
      aspectRatio: `${mediaWidth} / ${mediaHeight}`,
      objectFit: "contain",
    }
  }
  if (preset.width > 0 && preset.height > 0) {
    return {
      aspectRatio: `${preset.width} / ${preset.height}`,
      objectFit: preset.cropMode === "none" ? "contain" : "cover",
    }
  }
  const [w, h] = preset.aspectRatio.split(":").map(Number)
  if (w > 0 && h > 0) {
    return {
      aspectRatio: `${w} / ${h}`,
      objectFit: preset.cropMode === "none" ? "contain" : "cover",
    }
  }
  return { aspectRatio: "16 / 9", objectFit: "contain" }
}

/** Prefer Master / none-crop landscape, else first landscape, else first preset. */
export function pickDefaultPreset(
  presets: OutputPreset[],
  mediaWidth?: number | null,
  mediaHeight?: number | null
): OutputPreset | null {
  if (!presets.length) return null

  const isPortrait =
    mediaWidth != null &&
    mediaHeight != null &&
    mediaHeight > mediaWidth

  const noneCrop = presets.filter((p) => p.cropMode === "none" && formatFamily(p) !== "audio")
  if (isPortrait) {
    const vertical =
      presets.find((p) => formatFamily(p) === "portrait") ??
      noneCrop.find((p) => formatFamily(p) === "portrait")
    if (vertical) return vertical
  }

  const master = noneCrop.find(
    (p) =>
      p.name.toLowerCase().includes("master") ||
      formatFamily(p) === "landscape"
  )
  if (master) return master

  return (
    presets.find((p) => formatFamily(p) === "landscape") ??
    presets.find((p) => formatFamily(p) !== "audio") ??
    presets[0]
  )
}

export function renderKindForPreset(preset: OutputPreset): string {
  return formatFamily(preset) === "audio" ? "audio" : "master"
}

/** Curated chips: one Original, landscape variants, vertical, audio — de-dupe by id. */
export function curatedPresets(presets: OutputPreset[]): OutputPreset[] {
  const out: OutputPreset[] = []
  const seen = new Set<string>()

  const push = (p?: OutputPreset) => {
    if (!p || seen.has(p.id)) return
    seen.add(p.id)
    out.push(p)
  }

  push(
    presets.find(
      (p) =>
        p.cropMode === "none" &&
        formatFamily(p) === "landscape" &&
        p.name.toLowerCase().includes("master")
    ) ??
      presets.find(
        (p) => p.cropMode === "none" && formatFamily(p) === "landscape"
      )
  )

  for (const p of presets) {
    if (formatFamily(p) === "landscape" && !p.name.toLowerCase().includes("master")) {
      push(p)
    }
  }
  for (const p of presets) {
    if (formatFamily(p) === "portrait") push(p)
  }
  for (const p of presets) {
    if (formatFamily(p) === "square") push(p)
  }
  for (const p of presets) {
    if (formatFamily(p) === "audio") push(p)
  }
  for (const p of presets) push(p)

  return out
}
