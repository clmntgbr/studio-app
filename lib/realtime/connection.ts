export type RealtimeConnection = {
  token: string
  channel: string
  wsUrl: string
}

let connectionRequest: Promise<RealtimeConnection | null> | null = null

export function getRealtimeConnection(
  force = false
): Promise<RealtimeConnection | null> {
  if (force) connectionRequest = null
  if (!connectionRequest) {
    connectionRequest = fetchRealtimeConnection().then((connection) => {
      if (!connection) connectionRequest = null
      return connection
    })
  }
  return connectionRequest
}

export function clearRealtimeConnection() {
  connectionRequest = null
}

async function fetchRealtimeConnection(): Promise<RealtimeConnection | null> {
  try {
    const response = await fetch("/api/realtime/connection", {
      method: "GET",
      cache: "no-store",
    })
    if (!response.ok) return null

    const data = (await response.json()) as Partial<RealtimeConnection>
    if (!data.token || !data.channel || !data.wsUrl) return null

    return {
      token: data.token,
      channel: data.channel,
      wsUrl: data.wsUrl,
    }
  } catch {
    return null
  }
}
