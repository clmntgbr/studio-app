"use client"

import {
  clearRealtimeConnection,
  getRealtimeConnection,
} from "@/lib/realtime/connection"
import { Centrifuge } from "centrifuge"

type PublicationHandler = (data: unknown) => void

let client: Centrifuge | null = null
let starting: Promise<void> | null = null
let startingProjectId: string | null = null
let subscribers = 0
let releaseTimer: ReturnType<typeof setTimeout> | null = null
let activeProjectId: string | null = null
const handlers = new Set<PublicationHandler>()

export function subscribeRealtime(
  projectId: string,
  handler: PublicationHandler
) {
  handlers.add(handler)
  subscribers += 1
  if (releaseTimer) {
    clearTimeout(releaseTimer)
    releaseTimer = null
  }

  if (activeProjectId && activeProjectId !== projectId) {
    client?.disconnect()
    client = null
    clearRealtimeConnection()
    starting = null
    startingProjectId = null
  }
  activeProjectId = projectId
  void ensureClient(projectId)

  return () => {
    handlers.delete(handler)
    subscribers -= 1
    if (subscribers > 0) return
    releaseTimer = setTimeout(() => {
      if (subscribers > 0) return
      client?.disconnect()
      client = null
      activeProjectId = null
      starting = null
      startingProjectId = null
      clearRealtimeConnection()
    }, 100)
  }
}

function ensureClient(projectId: string) {
  if (client && activeProjectId === projectId) return Promise.resolve()
  if (starting && startingProjectId === projectId) return starting
  if (starting && startingProjectId !== projectId) {
    // Drop stale in-flight connect for another project.
    starting = null
    startingProjectId = null
  }
  startingProjectId = projectId
  starting = connect(projectId)
  return starting
}

async function connect(projectId: string) {
  try {
    const connection = await getRealtimeConnection()
    if (!connection || subscribers === 0) return
    // Project may have changed while awaiting connection credentials.
    if (activeProjectId !== projectId) return
    if (client) return

    const next = new Centrifuge(connection.wsUrl, {
      token: connection.token,
      getToken: async () => {
        const refreshed = await getRealtimeConnection(true)
        if (!refreshed?.token) {
          throw new Error("Realtime token refresh failed")
        }
        return refreshed.token
      },
    })

    const onPublication = (data: unknown) => {
      for (const handler of handlers) handler(data)
    }

    const userSub = next.newSubscription(connection.channel)
    userSub.on("publication", (ctx) => onPublication(ctx.data))
    userSub.subscribe()

    const projectChannel = `projects:${projectId}`
    if (projectChannel !== connection.channel) {
      const projectSub = next.newSubscription(projectChannel)
      projectSub.on("publication", (ctx) => onPublication(ctx.data))
      projectSub.subscribe()
    }

    next.connect()
    if (activeProjectId !== projectId) {
      next.disconnect()
      return
    }
    client = next
  } finally {
    if (startingProjectId === projectId) {
      starting = null
      startingProjectId = null
    }
  }
}
