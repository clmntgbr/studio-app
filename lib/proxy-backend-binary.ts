import { requireAuth } from "@/lib/require-auth"
import { NextResponse } from "next/server"

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL

/** Proxies a binary/stream response from the backend API (Range-aware). */
export async function proxyBackendBinary(
  request: Request,
  path: string
): Promise<NextResponse> {
  try {
    const auth = await requireAuth()
    if ("error" in auth) return auth.error

    const query = new URL(request.url).search
    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth.token}`,
    }
    const range = request.headers.get("range")
    if (range) headers.Range = range
    if (BACKEND_API_URL?.includes("ngrok")) {
      headers["ngrok-skip-browser-warning"] = "1"
    }

    const response = await fetch(`${BACKEND_API_URL}/api${path}${query}`, {
      method: "GET",
      headers,
      cache: "no-store",
    })

    if (!response.ok && response.status !== 206) {
      const body = await response.text()
      return new NextResponse(body || "Upstream error", {
        status: response.status,
      })
    }

    const out = new Headers()
    for (const key of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
      "cache-control",
    ]) {
      const value = response.headers.get(key)
      if (value) out.set(key, value)
    }
    if (!out.has("accept-ranges")) out.set("Accept-Ranges", "bytes")
    if (!out.has("cache-control")) {
      out.set("Cache-Control", "private, max-age=60")
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: out,
    })
  } catch {
    return NextResponse.json(
      { message: "Failed to proxy media stream" },
      { status: 500 }
    )
  }
}
