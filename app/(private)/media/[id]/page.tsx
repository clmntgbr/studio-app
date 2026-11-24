"use client"

import { useMedia, useMediaSteps } from "@/lib/media/hooks"
import { formatDurationSeconds } from "@/lib/utils"
import Link from "next/link"
import { useParams } from "next/navigation"

export default function MediaPage() {
  const params = useParams<{ id: string }>()
  const mediaId = params.id
  const { data: media, isLoading, error } = useMedia(mediaId)
  const { data: stepsPayload } = useMediaSteps(mediaId)

  const steps = stepsPayload?.steps ?? media?.steps ?? []
  const runs = stepsPayload?.runs ?? []

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
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Raw</h2>
          <pre className="bg-muted/40 overflow-auto rounded-md border p-3 text-xs">
            {JSON.stringify(media, null, 2)}
          </pre>
        </section>
      ) : null}
    </main>
  )
}
