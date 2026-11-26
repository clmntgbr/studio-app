"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import {
  formatMasterSplit,
  parseMasterSplit,
  type MasterSplitMode,
} from "@/lib/media/master-split"
import type { Clip, MediaConfiguration } from "@/lib/media/types"
import {
  curatedPresets,
  formatLabel,
} from "@/lib/output-presets/format"
import type { OutputPreset } from "@/lib/output-presets/types"
import { formatDurationSeconds } from "@/lib/utils"
import { useEffect, useMemo, useState } from "react"

function formatRange(startMs: number, endMs: number) {
  return `${formatDurationSeconds(startMs)} – ${formatDurationSeconds(endMs)}`
}

const FIELD_CLASS_NAME = "h-9 bg-background dark:bg-background"
const SELECT_CLASS_NAME =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-xs/relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 dark:bg-background"

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
  falseStartsEnabled: boolean
  burnSubtitles: boolean
  outputPresetId: string | null
  splitMode: MasterSplitMode
  splitParts: number
  splitDurationMin: number
}

function draftFrom(cfg: MediaConfiguration): Draft {
  const split = parseMasterSplit(cfg.masterSplit)
  return {
    silenceEnabled: cfg.silenceEnabled,
    detectionLevel: cfg.detectionLevel || "standard",
    paddingBeforeMs: cfg.paddingBeforeMs,
    paddingAfterMs: cfg.paddingAfterMs,
    silenceMinDurationMs: cfg.silenceMinDurationMs,
    fillersEnabled: cfg.fillersEnabled,
    repetitionsEnabled: cfg.repetitionsEnabled,
    falseStartsEnabled: cfg.falseStartsEnabled,
    burnSubtitles: cfg.burnSubtitles,
    outputPresetId: cfg.outputPresetId ?? null,
    splitMode: split.mode,
    splitParts: split.parts,
    splitDurationMin: split.durationMin,
  }
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`
}

function silenceChanged(base: Draft, current: Draft) {
  return (
    current.silenceEnabled !== base.silenceEnabled ||
    current.detectionLevel !== base.detectionLevel ||
    current.paddingBeforeMs !== base.paddingBeforeMs ||
    current.paddingAfterMs !== base.paddingAfterMs ||
    current.silenceMinDurationMs !== base.silenceMinDurationMs ||
    current.fillersEnabled !== base.fillersEnabled ||
    current.repetitionsEnabled !== base.repetitionsEnabled ||
    current.falseStartsEnabled !== base.falseStartsEnabled
  )
}

export type MediaSettingsSavePayload = {
  patch: {
    silenceEnabled: boolean
    detectionLevel: string
    paddingBeforeMs: number
    paddingAfterMs: number
    silenceMinDurationMs: number
    fillersEnabled: boolean
    repetitionsEnabled: boolean
    falseStartsEnabled: boolean
    burnSubtitles: boolean
    outputPresetId: string | null
    masterSplit: string
  }
  reanalyze: boolean
}

export function MediaSettingsDrawer({
  open,
  onOpenChange,
  config,
  saving,
  onSave,
  presets = [],
  clips = [],
  clipsLoading,
  clipsWaiting,
  clipsError,
  clipsToggling,
  onToggleClip,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: MediaConfiguration | null | undefined
  saving?: boolean
  onSave: (payload: MediaSettingsSavePayload) => void
  presets?: OutputPreset[]
  clips?: Clip[]
  clipsLoading?: boolean
  clipsWaiting?: boolean
  clipsError?: string | null
  clipsToggling?: boolean
  onToggleClip?: (clipId: string, selected: boolean) => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    if (!open || !config) return
    setDraft(draftFrom(config))
  }, [open, config])

  const current = draft ?? (config ? draftFrom(config) : null)
  const formatItems = useMemo(() => curatedPresets(presets), [presets])

  const dirty = useMemo(() => {
    if (!config || !current) return false
    return JSON.stringify(draftFrom(config)) !== JSON.stringify(current)
  }, [config, current])

  const detectionIndex = (() => {
    if (!current) return 1
    const idx = DETECTION_LEVELS.findIndex((l) => l.id === current.detectionLevel)
    return idx >= 0 ? idx : 1
  })()

  function update(next: Partial<Draft>) {
    if (saving || !current) return
    setDraft({ ...current, ...next })
  }

  function handleOpenChange(next: boolean) {
    if (!next && saving) return
    onOpenChange(next)
  }

  function save() {
    if (!config || !current || !dirty || saving) return
    const base = draftFrom(config)
    onSave({
      patch: {
        silenceEnabled: current.silenceEnabled,
        detectionLevel: current.detectionLevel,
        paddingBeforeMs: current.paddingBeforeMs,
        paddingAfterMs: current.paddingAfterMs,
        silenceMinDurationMs: current.silenceMinDurationMs,
        fillersEnabled: current.fillersEnabled,
        repetitionsEnabled: current.repetitionsEnabled,
        falseStartsEnabled: current.falseStartsEnabled,
        burnSubtitles: current.burnSubtitles,
        outputPresetId: current.outputPresetId,
        masterSplit: formatMasterSplit({
          mode: current.splitMode,
          parts: current.splitParts,
          durationMin: current.splitDurationMin,
        }),
      },
      reanalyze: silenceChanged(base, current),
    })
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        showCloseButton
        className="flex h-full w-[80vw]! max-w-[80vw]! flex-col gap-0 p-0 sm:max-w-[80vw]!"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Media settings</SheetTitle>
          <SheetDescription>
            Silence cuts, proposed clips, subtitles burn-in, and master split.
          </SheetDescription>
        </SheetHeader>

        {!current ? (
          <p className="text-muted-foreground px-6 py-8">Loading…</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto px-6 py-8">
              <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
                <div className="space-y-1">
                  <h2 className="font-semibold">Cuts</h2>
                  <p className="text-muted-foreground text-sm">
                    Silence detection, fillers, and padding around kept speech.
                  </p>
                </div>
                <div className="flex flex-col gap-6 md:col-span-2">
                  <SwitchRow
                    id="silence-enabled"
                    label="Silence"
                    checked={current.silenceEnabled}
                    disabled={!!saving}
                    onCheckedChange={(silenceEnabled) =>
                      update({ silenceEnabled })
                    }
                  />
                  <SwitchRow
                    id="fillers-enabled"
                    label="Fillers"
                    checked={current.fillersEnabled}
                    disabled={!!saving}
                    onCheckedChange={(fillersEnabled) =>
                      update({ fillersEnabled })
                    }
                  />
                  <SwitchRow
                    id="repetitions-enabled"
                    label="Repetitions"
                    checked={current.repetitionsEnabled}
                    disabled={!!saving}
                    onCheckedChange={(repetitionsEnabled) =>
                      update({ repetitionsEnabled })
                    }
                  />
                  <SwitchRow
                    id="false-starts-enabled"
                    label="False starts"
                    checked={current.falseStartsEnabled}
                    disabled={!!saving}
                    onCheckedChange={(falseStartsEnabled) =>
                      update({ falseStartsEnabled })
                    }
                  />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="detection-level">Detection level</Label>
                      <span className="text-muted-foreground text-xs">
                        {DETECTION_LEVELS[detectionIndex]?.label}
                      </span>
                    </div>
                    <input
                      id="detection-level"
                      type="range"
                      min={0}
                      max={DETECTION_LEVELS.length - 1}
                      step={1}
                      value={detectionIndex}
                      disabled={!!saving}
                      className="w-full accent-primary"
                      onChange={(event) =>
                        update({
                          detectionLevel:
                            DETECTION_LEVELS[Number(event.target.value)]?.id ??
                            "standard",
                        })
                      }
                    />
                  </div>

                  <SliderRow
                    id="padding-before"
                    label="Padding before"
                    valueLabel={formatSeconds(current.paddingBeforeMs)}
                    min={PADDING_BEFORE.min}
                    max={PADDING_BEFORE.max}
                    step={PADDING_BEFORE.step}
                    value={current.paddingBeforeMs}
                    disabled={!!saving || !current.silenceEnabled}
                    onChange={(paddingBeforeMs) => update({ paddingBeforeMs })}
                  />
                  <SliderRow
                    id="padding-after"
                    label="Padding after"
                    valueLabel={formatSeconds(current.paddingAfterMs)}
                    min={PADDING_AFTER.min}
                    max={PADDING_AFTER.max}
                    step={PADDING_AFTER.step}
                    value={current.paddingAfterMs}
                    disabled={!!saving || !current.silenceEnabled}
                    onChange={(paddingAfterMs) => update({ paddingAfterMs })}
                  />
                  <SliderRow
                    id="min-silence"
                    label="Min silence"
                    valueLabel={formatSeconds(current.silenceMinDurationMs)}
                    min={MIN_SILENCE.min}
                    max={MIN_SILENCE.max}
                    step={MIN_SILENCE.step}
                    value={current.silenceMinDurationMs}
                    disabled={!!saving || !current.silenceEnabled}
                    onChange={(silenceMinDurationMs) =>
                      update({ silenceMinDurationMs })
                    }
                  />
                </div>
              </div>

              <Separator className="my-10" />

              <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
                <div className="space-y-1">
                  <h2 className="font-semibold">Clips</h2>
                  <p className="text-muted-foreground text-sm">
                    Proposed LLM clips. Check those to include in the next Ship.
                  </p>
                </div>
                <div className="flex flex-col gap-4 md:col-span-2">
                  {clipsError ? (
                    <p className="text-destructive text-sm">{clipsError}</p>
                  ) : null}
                  {clipsWaiting ? (
                    <p className="text-muted-foreground text-sm">
                      Waiting for LLM analysis…
                    </p>
                  ) : clipsLoading ? (
                    <p className="text-muted-foreground text-sm">Loading…</p>
                  ) : clips.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No clips yet.</p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {clips.map((c) => (
                        <li key={c.id} className="px-4 py-3 text-sm">
                          <label className="flex cursor-pointer items-start justify-between gap-4">
                            <span className="flex min-w-0 items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={c.selected}
                                disabled={!!clipsToggling || !onToggleClip}
                                onChange={(e) =>
                                  onToggleClip?.(c.id, e.target.checked)
                                }
                              />
                              <span className="min-w-0">
                                <span className="font-medium">
                                  {c.title || c.hook || "Clip"}
                                </span>
                                {c.hook && c.title ? (
                                  <span className="text-muted-foreground mt-1 block">
                                    {c.hook}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                            <span className="text-muted-foreground shrink-0">
                              {formatRange(c.sourceStartMs, c.sourceEndMs)}
                              {c.score != null
                                ? ` · ${c.score.toFixed(2)}`
                                : ""}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <Separator className="my-10" />

              <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
                <div className="space-y-1">
                  <h2 className="font-semibold">Ship</h2>
                  <p className="text-muted-foreground text-sm">
                    Output format for the right preview, burn-in, and master
                    split.
                  </p>
                </div>
                <div className="flex flex-col gap-6 md:col-span-2">
                  <div className="space-y-2">
                    <Label>Output format</Label>
                    {formatItems.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        Loading formats…
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {formatItems.map((preset) => {
                          const active = current.outputPresetId === preset.id
                          return (
                            <Button
                              key={preset.id}
                              type="button"
                              size="sm"
                              variant={active ? "default" : "outline"}
                              disabled={!!saving}
                              title={`${preset.name} · ${preset.aspectRatio}`}
                              onClick={() =>
                                update({ outputPresetId: preset.id })
                              }
                            >
                              {formatLabel(preset)} · {preset.aspectRatio}
                            </Button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <SwitchRow
                    id="burn-subtitles"
                    label="Burn SRT"
                    checked={current.burnSubtitles}
                    disabled={!!saving}
                    onCheckedChange={(burnSubtitles) =>
                      update({ burnSubtitles })
                    }
                  />

                  <div className="space-y-2">
                    <Label>Master split</Label>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["off", "Off"],
                          ["parts", "Parts"],
                          ["duration", "Duration"],
                        ] as const
                      ).map(([mode, label]) => (
                        <Button
                          key={mode}
                          type="button"
                          size="sm"
                          variant={
                            current.splitMode === mode ? "default" : "outline"
                          }
                          disabled={!!saving}
                          onClick={() => update({ splitMode: mode })}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {current.splitMode === "parts" ? (
                    <div className="space-y-2">
                      <Label htmlFor="split-parts">Number of parts</Label>
                      <Input
                        id="split-parts"
                        type="number"
                        min={2}
                        max={50}
                        value={current.splitParts}
                        disabled={!!saving}
                        className={FIELD_CLASS_NAME}
                        onChange={(event) =>
                          update({
                            splitParts: Number(event.target.value) || 2,
                          })
                        }
                      />
                    </div>
                  ) : null}

                  {current.splitMode === "duration" ? (
                    <div className="space-y-2">
                      <Label htmlFor="split-duration">Max minutes / part</Label>
                      <Input
                        id="split-duration"
                        type="number"
                        min={1}
                        max={60}
                        value={current.splitDurationMin}
                        disabled={!!saving}
                        className={FIELD_CLASS_NAME}
                        onChange={(event) =>
                          update({
                            splitDurationMin: Number(event.target.value) || 1,
                          })
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <SheetFooter className="border-t">
              <div />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!!saving}
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!dirty || !!saving}
                  onClick={save}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function SwitchRow({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id}>{label}</Label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

function SliderRow({
  id,
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  id: string
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
    <div className={`space-y-2 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {valueLabel}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        className="w-full accent-primary"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}
