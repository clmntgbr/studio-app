"use client"

import { TimelineEditor } from "@/components/editor/timeline-editor"
import { useParams } from "next/navigation"

export default function ProjectEditPage() {
  const params = useParams<{ id: string }>()
  return <TimelineEditor key={params.id} projectId={params.id} />
}
