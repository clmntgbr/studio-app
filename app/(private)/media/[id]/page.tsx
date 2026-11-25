"use client"

import {
  useMedia,
  useMediaDetections,
  useMediaLLMArtifacts,
  useMediaSteps,
  useProjectClips,
} from "@/lib/media/hooks"
import { chaptersFromArtifacts } from "@/lib/media/chapters"
import { formatDurationSeconds } from "@/lib/utils"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMemo } from "react"

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
        {clipsLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : clips.length === 0 ? (
          <p className="text-muted-foreground text-sm">No clips yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {clips.map((c) => (
              <li key={c.id} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="font-medium">
                    {c.title || c.hook || "Clip"}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {formatRange(c.sourceStartMs, c.sourceEndMs)}
                    {c.score != null ? ` · ${c.score.toFixed(2)}` : ""}
                  </span>
                </div>
                {c.hook && c.title ? (
                  <p className="text-muted-foreground">{c.hook}</p>
                ) : null}
              </li>
            ))}
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
