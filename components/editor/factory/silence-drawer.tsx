"use client"

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import type { MediaConfiguration } from "@/lib/media/types"
import { useEffect, useMemo, useState } from "react"

const DETECTION_LEVELS = [
  { id: "gentle", label: "Gentle" },
  { id: "standard", label: "Standard" },
  { id: "aggressive", label: "Aggressive" },
] as const

const PADDING_BEFORE = { min: 0, max: 400, step: 10 }
const PADDING_AFTER = { min: 0, max: 500, step: 10 }
const MIN_SILENCE = { min: 100, max: 2000, step: 50 }

type Draft = {
  silenceEnabled: boolean
  detectionLevel: string
  paddingBeforeMs: number
  paddingAfterMs: number
  silenceMinDurationMs: number
  fillersEnabled: boolean
  repetitionsEnabled: boolean
}

function draftFrom(cfg: MediaConfiguration): Draft {
  return {
    silenceEnabled: cfg.silenceEnabled,
    detectionLevel: cfg.detectionLevel || "standard",
    paddingBeforeMs: cfg.paddingBeforeMs,
    paddingAfterMs: cfg.paddingAfterMs,
    silenceMinDurationMs: cfg.silenceMinDurationMs,
    fillersEnabled: cfg.fillersEnabled,
    repetitionsEnabled: cfg.repetitionsEnabled,
  }
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`
}

export type SilenceApplyPayload = {
  patch: {
    silenceEnabled: boolean
    detectionLevel: string
    paddingBeforeMs: number
    paddingAfterMs: number
    silenceMinDurationMs: number
    fillersEnabled: boolean
    repetitionsEnabled: boolean
  }
}

export function SilenceDrawer({
  open,
  onOpenChange,
  config,
  saving,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: MediaConfiguration | null | undefined
  saving?: boolean
  onSave: (payload: SilenceApplyPayload) => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    if (!open || !config) return
    setDraft(draftFrom(config))
  }, [open, config])

  const current = draft ?? (config ? draftFrom(config) : null)

  const dirty = useMemo(() => {
    if (!config || !current) return false
    const base = draftFrom(config)
    return (
      current.silenceEnabled !== base.silenceEnabled ||
      current.detectionLevel !== base.detectionLevel ||
      current.paddingBeforeMs !== base.paddingBeforeMs ||
      current.paddingAfterMs !== base.paddingAfterMs ||
      current.silenceMinDurationMs !== base.silenceMinDurationMs ||
      current.fillersEnabled !== base.fillersEnabled ||
      current.repetitionsEnabled !== base.repetitionsEnabled
    )
  }, [config, current])

  const detectionIndex = (() => {
    if (!current) return 0
    const idx = DETECTION_LEVELS.findIndex((l) => l.id === current.detectionLevel)
    return idx >= 0 ? idx : 1 // standard fallback for unknown levels
  })()
  const silenceOff = !current?.silenceEnabled || !!saving
  const detectionLevelOff =
    !!saving ||
    !(
      current?.silenceEnabled ||
      current?.fillersEnabled ||
      current?.repetitionsEnabled
    )

  function update(next: Partial<Draft>) {
    if (saving || !current) return
    setDraft({ ...current, ...next })
  }

  function save() {
    if (!config || !current || !dirty || saving) return
    onSave({
      patch: {
        silenceEnabled: current.silenceEnabled,
        detectionLevel: current.detectionLevel,
        paddingBeforeMs: current.paddingBeforeMs,
        paddingAfterMs: current.paddingAfterMs,
        silenceMinDurationMs: current.silenceMinDurationMs,
        fillersEnabled: current.fillersEnabled,
        repetitionsEnabled: current.repetitionsEnabled,
      },
    })
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return
        onOpenChange(next)
      }}
      direction="right"
      handleOnly
    >
      <DrawerContent className="clip-factory">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-[#232733] px-5 py-4">
            <DrawerTitle>Silence / Cut settings</DrawerTitle>
            <DrawerDescription className="mt-1">
              Save regenerates silence &amp; text analysis, rebuilds the timeline,
              then reloads the editor.
            </DrawerDescription>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {!current ? (
              <p className="text-[11px] text-[#8b93a7]">Loading silence settings…</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-4 text-[11px]">
                  <Toggle
                    label="Silence"
                    checked={current.silenceEnabled}
                    disabled={!!saving}
                    onChange={(silenceEnabled) => update({ silenceEnabled })}
                  />
                  <Toggle
                    label="Fillers"
                    checked={current.fillersEnabled}
                    disabled={!!saving}
                    onChange={(fillersEnabled) => update({ fillersEnabled })}
                  />
                  <Toggle
                    label="Repetitions"
                    checked={current.repetitionsEnabled}
                    disabled={!!saving}
                    onChange={(repetitionsEnabled) =>
                      update({ repetitionsEnabled })
                    }
                  />
                </div>

                <div
                  className={`space-y-1 ${detectionLevelOff ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#8b93a7]">Detection level</span>
                    <span className="text-[#b8ff3c]">
                      {DETECTION_LEVELS[detectionIndex]?.label}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={DETECTION_LEVELS.length - 1}
                    step={1}
                    value={detectionIndex}
                    disabled={detectionLevelOff}
                    className="w-full accent-[#b8ff3c]"
                    onChange={(event) =>
                      update({
                        detectionLevel:
                          DETECTION_LEVELS[Number(event.target.value)]?.id ??
                          "standard",
                      })
                    }
                  />
                  <div className="grid grid-cols-3 text-center text-[10px] text-[#8b93a7]">
                    {DETECTION_LEVELS.map((level) => (
                      <span
                        key={level.id}
                        className={
                          level.id === current.detectionLevel
                            ? "text-[#f2f4f8]"
                            : ""
                        }
                      >
                        {level.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className={`space-y-4 ${silenceOff ? "opacity-50" : ""}`}>
                  <SliderField
                    label="Padding before"
                    valueLabel={formatSeconds(current.paddingBeforeMs)}
                    min={PADDING_BEFORE.min}
                    max={PADDING_BEFORE.max}
                    step={PADDING_BEFORE.step}
                    value={current.paddingBeforeMs}
                    disabled={silenceOff}
                    onChange={(paddingBeforeMs) => update({ paddingBeforeMs })}
                  />
                  <SliderField
                    label="Padding after"
                    valueLabel={formatSeconds(current.paddingAfterMs)}
                    min={PADDING_AFTER.min}
                    max={PADDING_AFTER.max}
                    step={PADDING_AFTER.step}
                    value={current.paddingAfterMs}
                    disabled={silenceOff}
                    onChange={(paddingAfterMs) => update({ paddingAfterMs })}
                  />
                  <SliderField
                    label="Min silence"
                    valueLabel={formatSeconds(current.silenceMinDurationMs)}
                    min={MIN_SILENCE.min}
                    max={MIN_SILENCE.max}
                    step={MIN_SILENCE.step}
                    value={current.silenceMinDurationMs}
                    disabled={silenceOff}
                    onChange={(silenceMinDurationMs) =>
                      update({ silenceMinDurationMs })
                    }
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex shrink-0 gap-2 border-t border-[#232733] px-5 py-4">
            <button
              type="button"
              className="cf-btn flex-1"
              disabled={!!saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cf-btn cf-btn-primary flex-1"
              disabled={!dirty || !!saving || !current}
              onClick={save}
            >
              {saving ? "Rebuilding…" : "Save & rebuild"}
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="accent-[#b8ff3c]"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={checked ? "text-[#f2f4f8]" : "text-[#8b93a7]"}>
        {label}
      </span>
    </label>
  )
}

function SliderField({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  label: string
  valueLabel: string
  min: number
  max: number
  step: number
  value: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[#8b93a7]">{label}</span>
        <span className="tabular-nums text-[#b8ff3c]">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        className="w-full accent-[#b8ff3c]"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}
