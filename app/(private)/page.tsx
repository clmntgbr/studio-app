"use client"

import { useCreateProject, useProjects } from "@/lib/projects/hooks"
import { useUser } from "@/lib/user/hooks"
import Link from "next/link"
import { FormEvent, useState } from "react"

export default function ProjectsPage() {
  const { user, isLoading: userLoading } = useUser()
  const { data: projects, isLoading, error, refetch } = useProjects()
  const createProject = useCreateProject()
  const [name, setName] = useState("")

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await createProject.mutateAsync({ name: trimmed })
    setName("")
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Studio</h1>
        <p className="text-muted-foreground text-sm">
          Minimal test UI —{" "}
          {userLoading
            ? "loading user…"
            : user
              ? `${user.firstname ?? ""} ${user.lastname ?? ""}`.trim() ||
                user.id
              : "no user"}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">New project</h2>
        <form onSubmit={onCreate} className="flex gap-2">
          <input
            className="border-input bg-background flex-1 rounded-md border px-3 py-2 text-sm"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            disabled={createProject.isPending || !name.trim()}
            className="bg-foreground text-background rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {createProject.isPending ? "Creating…" : "Create"}
          </button>
        </form>
        {createProject.error ? (
          <p className="text-sm text-red-600">
            {(createProject.error as Error).message}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Projects</h2>
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
          {(projects ?? []).map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="hover:bg-muted/40 flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">{p.status}</span>
              </Link>
            </li>
          ))}
          {!isLoading && (projects?.length ?? 0) === 0 ? (
            <li className="text-muted-foreground px-4 py-6 text-sm">
              No projects yet.
            </li>
          ) : null}
        </ul>
      </section>
    </main>
  )
}
