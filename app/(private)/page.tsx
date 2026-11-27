"use client"

import { uploadFile } from "@/lib/media/api"
import {
  useCreateMediaFromURL,
  useMediaList,
} from "@/lib/media/hooks"
import { queryKeys } from "@/lib/query/keys"
import { useUser } from "@/lib/user/hooks"
import { formatDurationSeconds } from "@/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"

export default function HomePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, isLoading: userLoading } = useUser()
  const { data: media, isLoading, error, refetch } = useMediaList()
  const fromURL = useCreateMediaFromURL()
  const [url, setUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function onFromURL(e: FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    const created = await fromURL.mutateAsync(trimmed)
    setUrl("")
    router.push(`/media/${created.id}`)
  }

  async function onFileChange(file: File | null) {
    if (!file) return
    setUploading(true)
    setUploadPct(0)
    setUploadError(null)
    try {
      const created = await uploadFile(file, setUploadPct)
      await queryClient.invalidateQueries({ queryKey: queryKeys.media.list() })
      router.push(`/media/${created.id}`)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      setUploadPct(null)
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Studio</h1>
        <p className="text-muted-foreground text-sm">
          {userLoading
            ? "loading user…"
            : user
              ? `${user.firstname ?? ""} ${user.lastname ?? ""}`.trim() ||
                user.id
              : "no user"}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Add by URL</h2>
        <form onSubmit={onFromURL} className="flex gap-2">
          <input
            className="border-input bg-background flex-1 rounded-md border px-3 py-2 text-sm"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="submit"
            disabled={fromURL.isPending || !url.trim()}
            className="bg-foreground text-background rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {fromURL.isPending ? "Queuing…" : "Fetch"}
          </button>
        </form>
        {fromURL.error ? (
          <p className="text-sm text-red-600">
            {(fromURL.error as Error).message}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Upload file</h2>
        <input
          type="file"
          accept="video/*,audio/*"
          disabled={uploading}
          onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        {uploading ? (
          <p className="text-muted-foreground text-sm">
            Uploading… {uploadPct ?? 0}%
          </p>
        ) : null}
        {uploadError ? (
          <p className="text-sm text-red-600">{uploadError}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Media</h2>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-muted-foreground text-sm underline"
          >
            Refresh
          </button>
        </div>
        {isLoading ? <p className="text-sm">Loading…</p> : null}
        {error ? (
          <p className="text-sm text-red-600">{(error as Error).message}</p>
        ) : null}
        <ul className="divide-y rounded-md border">
          {(media ?? []).map((m) => (
            <li
              key={m.id}
              className="hover:bg-muted/40 flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <Link href={`/media/${m.id}`} className="min-w-0 flex-1">
                <span className="font-medium">
                  {m.title || m.originalFilename || m.sourceUrl || m.id}
                </span>
                <span className="text-muted-foreground mt-1 block">
                  {m.sourceKind} · {m.status}
                  {m.durationMs != null
                    ? ` · ${formatDurationSeconds(m.durationMs)}`
                    : ""}
                </span>
              </Link>
              <Link
                href={`/media/${m.id}/watch`}
                className="text-muted-foreground shrink-0 underline"
              >
                Watch
              </Link>
            </li>
          ))}
          {!isLoading && (media?.length ?? 0) === 0 ? (
            <li className="text-muted-foreground px-4 py-6 text-sm">
              No media yet.
            </li>
          ) : null}
        </ul>
      </section>
    </main>
  )
}
