"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query/keys"
import { createProject, getProject, listProjects } from "./api"
import { CreateProjectInput } from "./types"

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: listProjects,
  })
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: queryKeys.projects.detail(id ?? ""),
    queryFn: () => getProject(id as string),
    enabled: !!id,
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() }),
  })
}
