"use client"

import {
  curatedPresets,
  formatFamily,
  formatLabel,
} from "@/lib/output-presets/format"
import type { OutputPreset } from "@/lib/output-presets/types"

function AspectGlyph({ preset }: { preset: OutputPreset }) {
  const family = formatFamily(preset)
  const box =
    family === "portrait"
      ? "h-5 w-3"
      : family === "square"
        ? "size-4"
        : family === "audio"
          ? "h-2 w-5"
          : "h-3 w-5"
  return (
    <span
      className={`inline-block rounded-[2px] border ${
        family === "portrait"
          ? "border-[#ff4d9a] bg-[#ff4d9a33]"
          : family === "audio"
            ? "border-[#5ce1ff] bg-[#5ce1ff33]"
            : "border-[#b8ff3c] bg-[#b8ff3c33]"
      } ${box}`}
      aria-hidden
    />
  )
}

export function FormatPicker({
  presets,
  selectedId,
  onSelect,
  disabled,
}: {
  presets: OutputPreset[]
  selectedId: string | null
  onSelect: (preset: OutputPreset) => void
  disabled?: boolean
}) {
  const items = curatedPresets(presets)

  if (!items.length) {
    return (
      <p className="text-[11px] text-[#8b93a7]">Loading output formats…</p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="cf-label">Output format</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((preset) => {
          const active = preset.id === selectedId
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(preset)}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[11px] transition ${
                active
                  ? "border-[#b8ff3c] bg-[#b8ff3c14] text-[#b8ff3c]"
                  : "border-[#232733] bg-[#12141a] text-[#8b93a7] hover:border-[#ff4d9a55] hover:text-[#f2f4f8]"
              }`}
              title={`${preset.name} · ${preset.width}×${preset.height} · ${preset.cropMode}`}
            >
              <AspectGlyph preset={preset} />
              <span className="flex flex-col leading-tight">
                <span className="tracking-wide uppercase">
                  {formatLabel(preset)}
                </span>
                <span className="text-[9px] opacity-70 normal-case">
                  {preset.name}
                  {preset.width > 0
                    ? ` · ${preset.width}×${preset.height}`
                    : ""}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
