"use client"

import { useProjectMedia } from "@/lib/media/hooks"
import { useParams, useRouter } from "next/navigation"
import { useEffect } from "react"

/** Legacy project editor URL → redirect to the first media's editor. */
export default function ProjectEditRedirectPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { data: media, isLoading } = useProjectMedia(params.id)

  useEffect(() => {
    if (isLoading) return
    const first = media?.[0]?.id
    if (first) {
      router.replace(`/media/${first}/edit`)
      return
    }
    router.replace(`/projects/${params.id}`)
  }, [isLoading, media, params.id, router])

  return (
    <p className="text-muted-foreground p-6 text-sm">Opening editor…</p>
  )
}
