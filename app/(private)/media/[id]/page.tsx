"use client"

import { useRenderEvents } from "@/lib/editor/use-render-events"
import {
  useMedia,
  useMediaDetections,
  useMediaLLMArtifacts,
  useMediaSteps,
  useProjectClips,
  useUpdateClip,
} from "@/lib/media/hooks"
import { chaptersFromArtifacts } from "@/lib/media/chapters"
import { downloadRender } from "@/lib/output-presets/api"
import {
  useOutputPresets,
  useProjectRenders,
} from "@/lib/output-presets/hooks"
import { formatDurationSeconds } from "@/lib/utils"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMemo, useState } from "react"

const DETECTION_PREVIEW = 50

function formatRange(startMs: number, endMs: number) {
  return `${formatDurationSeconds(startMs)} – ${formatDurationSeconds(endMs)}`
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function MediaPage() {
  const params = useParams<{ id: string }>()
  const mediaId = params.id
  const { data: media, isLoading, error } = useMedia(mediaId)
  const { data: stepsPayload } = useMediaSteps(mediaId)
  const steps = stepsPayload?.steps ?? media?.steps ?? []
  const runs = stepsPayload?.runs ?? []
  const projectId = media?.projectId ?? null
  const updateClipMut = useUpdateClip(projectId ?? "")
  const { data: renders = [], isLoading: rendersLoading } =
    useProjectRenders(projectId)
  const { data: presets = [] } = useOutputPresets()
  useRenderEvents(projectId)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [shipError, setShipError] = useState<string | null>(null)

  const resultsOpts = {
    mediaStatus: media?.status,
    steps,
  }
  const { data: artifacts = [], isLoading: artifactsLoading } =
    useMediaLLMArtifacts(mediaId, resultsOpts)
  const { data: detections = [], isLoading: detectionsLoading } =
    useMediaDetections(mediaId, resultsOpts)
  const clipsEnabled =
    !!media?.projectId &&
    (media.status === "ready" ||
      steps.some((s) => s.kind === "llm" && s.status === "completed"))
  const { data: projectClips = [], isLoading: clipsLoading } = useProjectClips(
    media?.projectId ?? null,
    clipsEnabled
  )

  const presetName = useMemo(() => {
    const map = new Map(presets.map((p) => [p.id, p.name]))
    return (id: string) => map.get(id) ?? id.slice(0, 8)
  }, [presets])

  async function onDownload(renderId: string) {
    setShipError(null)
    setDownloadingId(renderId)
    try {
      await downloadRender(renderId)
    } catch (err) {
      setShipError(err instanceof Error ? err.message : "Download failed")
    } finally {
      setDownloadingId(null)
    }
  }

  async function onToggleClip(clipId: string, selected: boolean) {
    if (!projectId) return
    setShipError(null)
    try {
      await updateClipMut.mutateAsync({ clipId, selected })
    } catch (err) {
      setShipError(
        err instanceof Error ? err.message : "Failed to update clip selection"
      )
    }
  }

  function latestClipRender(clipId: string) {
    return renders.find((r) => r.clipId === clipId && r.kind === "clip")
  }

  const chapters = useMemo(
    () => chaptersFromArtifacts(artifacts),
    [artifacts]
  )
  const clips = useMemo(
    () => projectClips.filter((c) => c.mediaFileId === mediaId),
    [projectClips, mediaId]
  )
  const detectionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of detections) {
      counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [detections])
  const detectionPreview = detections.slice(0, DETECTION_PREVIEW)

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <header className="space-y-2">
        {media?.projectId ? (
          <Link
            href={`/projects/${media.projectId}`}
            className="text-muted-foreground text-sm underline"
          >
            ← Project
          </Link>
        ) : (
          <Link href="/" className="text-muted-foreground text-sm underline">
            ← Projects
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">
          {isLoading
            ? "…"
            : media?.title ||
              media?.originalFilename ||
              media?.sourceUrl ||
              "Media"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {media?.status ?? "…"} · {media?.sourceKind ?? "…"}
          {media?.durationMs != null
            ? ` · ${formatDurationSeconds(media.durationMs)}`
            : ""}
        </p>
        <p className="text-muted-foreground font-mono text-xs">{mediaId}</p>
        {media?.projectId &&
        (media.status === "ready" ||
          media.status === "processing" ||
          steps.some((s) => s.kind === "probe" && s.status === "completed")) ? (
          <p>
            <Link
              href={`/projects/${media.projectId}/edit`}
              className="text-muted-foreground text-sm underline"
            >
              Open timeline editor
              {media.status !== "ready" ? " (proxy may still be encoding)" : ""}
            </Link>
          </p>
        ) : null}
      </header>

      {error ? (
        <p className="text-sm text-red-600">{(error as Error).message}</p>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-medium">Ship</h2>
          {projectId ? (
            <Link
              href={`/projects/${projectId}/edit`}
              className="text-muted-foreground text-sm underline"
            >
              Ship from editor
            </Link>
          ) : null}
        </div>
        {shipError ? (
          <p className="text-sm text-red-600">{shipError}</p>
        ) : null}
        {rendersLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : renders.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No ships yet. Open the timeline editor, pick a format, then Ship.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {renders.map((r) => {
              const pct =
                r.progress > 0 && r.progress <= 1
                  ? Math.round(r.progress * 100)
                  : Math.round(r.progress)
              return (
                <li key={r.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-medium">
                      {r.kind}
                      {r.clipId ? " clip" : ""} · {presetName(r.outputPresetId)}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {r.status === "completed"
                        ? "done"
                        : r.status === "failed"
                          ? "failed"
                          : r.status}
                      {r.status !== "completed" &&
                      r.status !== "failed" &&
                      pct > 0
                        ? ` · ${pct}%`
                        : ""}
                      {r.durationMs != null
                        ? ` · ${formatDurationSeconds(r.durationMs)}`
                        : ""}
                      {r.sizeBytes != null ? ` · ${formatBytes(r.sizeBytes)}` : ""}
                    </span>
                  </div>
                  {r.status === "failed" && r.errorMessage ? (
                    <p className="text-xs text-red-600">{r.errorMessage}</p>
                  ) : null}
                  {r.status === "completed" ? (
                    <button
                      type="button"
                      className="text-sm underline"
                      disabled={downloadingId === r.id}
                      onClick={() => void onDownload(r.id)}
                    >
                      {downloadingId === r.id ? "Opening…" : "Download"}
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Steps</h2>
        <ul className="divide-y rounded-md border">
          {steps.map((s) => (
            <li
              key={s.kind}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <span className="font-medium">{s.kind}</span>
              <span className="text-muted-foreground">
                {s.status}
                {s.progress > 0 && s.status === "running"
                  ? ` · ${Math.round(s.progress)}%`
                  : ""}
                {s.durationMs != null
                  ? ` · ${formatDurationSeconds(s.durationMs)}`
                  : ""}
              </span>
            </li>
          ))}
          {!isLoading && steps.length === 0 ? (
            <li className="text-muted-foreground px-4 py-6 text-sm">
              No steps yet.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Chapters</h2>
        {artifactsLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : chapters.length === 0 ? (
          <p className="text-muted-foreground text-sm">No chapters yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {chapters.map((c, i) => (
              <li
                key={`${c.sourceStartMs}-${c.sourceEndMs}-${i}`}
                className="flex items-start justify-between gap-4 px-4 py-3 text-sm"
              >
                <span className="font-medium">{c.title}</span>
                <span className="text-muted-foreground shrink-0">
                  {formatRange(c.sourceStartMs, c.sourceEndMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Clips</h2>
        <p className="text-muted-foreground text-sm">
          Propositions LLM toujours listées. Coche celles à encoder — le Ship
          global (éditeur) fait le master + les clips cochés.
        </p>
        {clipsLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : clips.length === 0 ? (
          <p className="text-muted-foreground text-sm">No clips yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {clips.map((c) => {
              const clipRender = latestClipRender(c.id)
              return (
                <li key={c.id} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <label className="flex min-w-0 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={c.selected}
                        disabled={updateClipMut.isPending || !projectId}
                        onChange={(e) =>
                          void onToggleClip(c.id, e.target.checked)
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
                    </label>
                    <span className="text-muted-foreground shrink-0">
                      {formatRange(c.sourceStartMs, c.sourceEndMs)}
                      {c.score != null ? ` · ${c.score.toFixed(2)}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pl-7">
                    <span className="text-muted-foreground">
                      {c.selected ? "Included in next Ship" : "Skipped at Ship"}
                    </span>
                    {clipRender ? (
                      <span className="text-muted-foreground">
                        · {clipRender.status}
                        {clipRender.status === "failed" &&
                        clipRender.errorMessage
                          ? ` · ${clipRender.errorMessage}`
                          : ""}
                      </span>
                    ) : null}
                    {clipRender?.status === "completed" ? (
                      <button
                        type="button"
                        className="text-sm underline"
                        disabled={downloadingId === clipRender.id}
                        onClick={() => void onDownload(clipRender.id)}
                      >
                        {downloadingId === clipRender.id
                          ? "Opening…"
                          : "Download"}
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Detections</h2>
        {detectionsLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : detections.length === 0 ? (
          <p className="text-muted-foreground text-sm">No detections yet.</p>
        ) : (
          <div className="space-y-3">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {detectionCounts.map(([kind, count]) => (
                <li key={kind} className="text-muted-foreground">
                  <span className="text-foreground font-medium">{kind}</span>{" "}
                  {count}
                </li>
              ))}
            </ul>
            <details className="rounded-md border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                Preview ({Math.min(detections.length, DETECTION_PREVIEW)}
                {detections.length > DETECTION_PREVIEW
                  ? ` of ${detections.length}`
                  : ""}
                )
              </summary>
              <ul className="divide-y border-t">
                {detectionPreview.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <span>{d.kind}</span>
                    <span className="text-muted-foreground">
                      {formatRange(d.sourceStartMs, d.sourceEndMs)}
                    </span>
                  </li>
                ))}
              </ul>
              {detections.length > DETECTION_PREVIEW ? (
                <p className="text-muted-foreground border-t px-4 py-2 text-xs">
                  Showing first {DETECTION_PREVIEW} of {detections.length}.
                </p>
              ) : null}
            </details>
          </div>
        )}
      </section>

      {runs.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Step runs</h2>
          <ul className="divide-y rounded-md border">
            {runs.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span>
                  {r.kind} #{r.attempt}
                </span>
                <span className="text-muted-foreground">
                  {r.status}
                  {r.durationMs != null
                    ? ` · ${formatDurationSeconds(r.durationMs)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {media ? (
        <details className="space-y-2">
          <summary className="cursor-pointer text-lg font-medium">Raw</summary>
          <pre className="bg-muted/40 overflow-auto rounded-md border p-3 text-xs">
            {JSON.stringify(media, null, 2)}
          </pre>
        </details>
      ) : null}
    </main>
  )
}
