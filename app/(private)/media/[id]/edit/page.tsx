"use client"

import { TimelineEditor } from "@/components/editor/timeline-editor"
import { useParams } from "next/navigation"

export default function MediaEditPage() {
  const params = useParams<{ id: string }>()
  return <TimelineEditor key={params.id} mediaId={params.id} />
}
