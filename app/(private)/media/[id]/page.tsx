"use client"

import { useRenderEvents } from "@/lib/editor/use-render-events"
import {
  useMedia,
  useMediaDetections,
  useMediaLLMArtifacts,
  useMediaSteps,
  useMediaClips,
  useUpdateClip,
} from "@/lib/media/hooks"
import { useMediaEvents } from "@/lib/media/use-media-events"
import { chaptersFromArtifacts } from "@/lib/media/chapters"
import { downloadRender } from "@/lib/output-presets/api"
import { useMediaRenders } from "@/lib/output-presets/hooks"
import { formatDurationSeconds } from "@/lib/utils"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMemo, useState } from "react"

const DETECTION_PREVIEW = 50

function formatRange(startMs: number, endMs: number) {
  return `${formatDurationSeconds(startMs)} – ${formatDurationSeconds(endMs)}`
}

export default function MediaPage() {
  const params = useParams<{ id: string }>()
  const mediaId = params.id
  const { data: media, isLoading, error } = useMedia(mediaId)
  const { data: stepsPayload } = useMediaSteps(mediaId)
  const steps = stepsPayload?.steps ?? media?.steps ?? []
  const runs = stepsPayload?.runs ?? []
    const updateClipMut = useUpdateClip(mediaId)
  const { data: renders = [] } = useMediaRenders(mediaId)
  useRenderEvents(mediaId)
  useMediaEvents(mediaId)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const resultsOpts = {
    mediaStatus: media?.status,
    steps,
  }
  const { data: artifacts = [], isLoading: artifactsLoading } =
    useMediaLLMArtifacts(mediaId, resultsOpts)
  const { data: detections = [], isLoading: detectionsLoading } =
    useMediaDetections(mediaId, resultsOpts)
  const clipsEnabled =
    (media?.status === "ready" || media?.status === "rendering" || steps.some((s) => s.kind === "llm" && s.status === "completed"))
  const { data: mediaClips = [], isLoading: clipsLoading } = useMediaClips(mediaId, clipsEnabled)

  async function onDownload(renderId: string) {
    setActionError(null)
    setDownloadingId(renderId)
    try {
      await downloadRender(renderId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Download failed")
    } finally {
      setDownloadingId(null)
    }
  }

  async function onToggleClip(clipId: string, selected: boolean) {
    if (!mediaId) return
    setActionError(null)
    try {
      await updateClipMut.mutateAsync({ clipId, selected })
    } catch (err) {
      setActionError(
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
  const clips = mediaClips
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
        <Link href="/" className="text-muted-foreground text-sm underline">
          ← Studio
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isLoading
            ? "…"
            : media?.title ||
              media?.originalFilename ||
              media?.sourceUrl ||
              "Media"}
        </h1>
        <p className="text-muted-foreground text-sm">
          <span className="rounded border px-1.5 py-0.5 font-mono text-xs uppercase tracking-wide">
            {media?.status ?? "…"}
          </span>
          {" · "}
          {media?.sourceKind ?? "…"}
          {media?.durationMs != null
            ? ` · ${formatDurationSeconds(media.durationMs)}`
            : ""}
        </p>
        <p className="text-muted-foreground font-mono text-xs">{mediaId}</p>
        {media &&
        media.status !== "ready" &&
        media.status !== "rendering" &&
        media.status !== "failed" ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Processing — editor unlocks when status is ready (all steps except
            render).
          </p>
        ) : null}
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link
            href={`/media/${mediaId}/watch`}
            className="text-muted-foreground text-sm underline"
          >
            Watch
          </Link>
          {media &&
          (media.status === "ready" || media.status === "rendering") ? (
            <Link
              href={`/media/${mediaId}/edit`}
              className="text-muted-foreground text-sm underline"
            >
              Open timeline editor
            </Link>
          ) : null}
        </p>
      </header>

      {error ? (
        <p className="text-sm text-red-600">{(error as Error).message}</p>
      ) : null}
      {actionError ? (
        <p className="text-sm text-red-600">{actionError}</p>
      ) : null}

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
          Proposed LLM clips. Check those to include when encoding from the
          editor (master + selected clips).
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
                        disabled={updateClipMut.isPending}
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
                      {c.selected
                        ? "Included on encode"
                        : "Skipped on encode"}
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
