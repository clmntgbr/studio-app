import { parseApiError } from "@/lib/api-error"
import { CreateProjectInput, Project } from "./types"

type Paginated<T> = { members: T[]; total: number }

export async function listProjects(): Promise<Project[]> {
  const response = await fetch("/api/projects?limit=100", { method: "GET" })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to list projects")
  }
  const data = (await response.json()) as Paginated<Project>
  return data.members ?? []
}

export async function getProject(id: string): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`, { method: "GET" })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to get project")
  }
  return response.json()
}

export async function createProject(
  input: CreateProjectInput
): Promise<Project> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw await parseApiError(response, "Failed to create project")
  }
  return response.json()
}
