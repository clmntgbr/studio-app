"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

export default function ProjectEditPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <Link
          href={`/projects/${projectId}`}
          className="text-muted-foreground text-sm underline"
        >
          ← Project
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Timeline editor
        </h1>
        <p className="text-muted-foreground text-sm">
          Coming next: KEEP/CUT segments, preview, and validate. Review chapters,
          clips, and detections on a media page for now.
        </p>
      </header>
    </main>
  )
}
