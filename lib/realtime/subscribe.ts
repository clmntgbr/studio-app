"use client"

import {
  clearRealtimeConnection,
  getRealtimeConnection,
} from "@/lib/realtime/connection"
import { Centrifuge } from "centrifuge"

type PublicationHandler = (data: unknown) => void

let client: Centrifuge | null = null
let starting: Promise<void> | null = null
let startingMediaId: string | null = null
let subscribers = 0
let releaseTimer: ReturnType<typeof setTimeout> | null = null
let activeMediaId: string | null = null
const handlers = new Set<PublicationHandler>()

export function subscribeRealtime(
  mediaId: string,
  handler: PublicationHandler
) {
  handlers.add(handler)
  subscribers += 1
  if (releaseTimer) {
    clearTimeout(releaseTimer)
    releaseTimer = null
  }

  if (activeMediaId && activeMediaId !== mediaId) {
    client?.disconnect()
    client = null
    clearRealtimeConnection()
    starting = null
    startingMediaId = null
  }
  activeMediaId = mediaId
  void ensureClient(mediaId)

  return () => {
    handlers.delete(handler)
    subscribers -= 1
    if (subscribers > 0) return
    releaseTimer = setTimeout(() => {
      if (subscribers > 0) return
      client?.disconnect()
      client = null
      activeMediaId = null
      starting = null
      startingMediaId = null
      clearRealtimeConnection()
    }, 100)
  }
}

function ensureClient(mediaId: string) {
  if (client && activeMediaId === mediaId) return Promise.resolve()
  if (starting && startingMediaId === mediaId) return starting
  if (starting && startingMediaId !== mediaId) {
    starting = null
    startingMediaId = null
  }
  startingMediaId = mediaId
  starting = connect(mediaId)
  return starting
}

async function connect(mediaId: string) {
  try {
    const connection = await getRealtimeConnection()
    if (!connection || subscribers === 0) return
    if (activeMediaId !== mediaId) return
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

    const mediaChannel = `media:${mediaId}`
    if (mediaChannel !== connection.channel) {
      const mediaSub = next.newSubscription(mediaChannel)
      mediaSub.on("publication", (ctx) => onPublication(ctx.data))
      mediaSub.subscribe()
    }

    next.connect()
    if (activeMediaId !== mediaId) {
      next.disconnect()
      return
    }
    client = next
  } finally {
    if (startingMediaId === mediaId) {
      starting = null
      startingMediaId = null
    }
  }
}
