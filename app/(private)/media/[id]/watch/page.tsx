"use client"

import { MediaSettingsDrawer } from "@/components/media/media-settings-drawer"
import { Button } from "@/components/ui/button"
import {
  useMedia,
  useMediaConfiguration,
  useMediaSteps,
  useProjectClips,
  useUpdateClip,
  useUpdateMediaConfiguration,
} from "@/lib/media/hooks"
import { useMediaEvents } from "@/lib/media/use-media-events"
import { useParams } from "next/navigation"
import { useMemo, useState } from "react"

export default function MediaWatchPage() {
  const params = useParams<{ id: string }>()
  const mediaId = params.id
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [clipError, setClipError] = useState<string | null>(null)

  const { data: media } = useMedia(mediaId)
  const { data: stepsPayload } = useMediaSteps(mediaId)
  const steps = stepsPayload?.steps ?? media?.steps ?? []
  const projectId = media?.projectId ?? null
  useMediaEvents(projectId, mediaId)

  const configQuery = useMediaConfiguration(mediaId)
  const updateConfig = useUpdateMediaConfiguration(mediaId)
  const updateClipMut = useUpdateClip(projectId ?? "")

  const clipsEnabled =
    !!projectId &&
    (media?.status === "ready" ||
      steps.some((s) => s.kind === "llm" && s.status === "completed"))
  const { data: projectClips = [], isLoading: clipsLoading } = useProjectClips(
    projectId,
    clipsEnabled
  )
  const clips = useMemo(
    () => projectClips.filter((c) => c.mediaFileId === mediaId),
    [projectClips, mediaId]
  )

  async function onToggleClip(clipId: string, selected: boolean) {
    if (!projectId) return
    setClipError(null)
    try {
      await updateClipMut.mutateAsync({ clipId, selected })
    } catch (err) {
      setClipError(
        err instanceof Error ? err.message : "Failed to update clip selection"
      )
    }
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => setSettingsOpen(true)}
        >
          Settings
        </Button>
      </div>

      <div className="bg-muted/40 aspect-video w-full rounded-md border" />

      <MediaSettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        config={configQuery.data}
        saving={updateConfig.isPending}
        clips={clips}
        clipsLoading={clipsLoading}
        clipsWaiting={!clipsEnabled}
        clipsError={clipError}
        clipsToggling={updateClipMut.isPending}
        onToggleClip={(clipId, selected) => {
          void onToggleClip(clipId, selected)
        }}
        onSave={({ patch, reanalyze }) => {
          void updateConfig
            .mutateAsync({ patch, reanalyze })
            .then(() => setSettingsOpen(false))
        }}
      />
    </main>
  )
}
