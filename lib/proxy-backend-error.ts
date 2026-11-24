import { NextResponse } from "next/server"

export async function proxyBackendError(
  response: Response
): Promise<NextResponse> {
  const text = await response.text()

  if (text) {
    try {
      const data = JSON.parse(text)
      if (data !== null && typeof data === "object" && !Array.isArray(data)) {
        return NextResponse.json(data, { status: response.status })
      }
    } catch {
      // not JSON
    }
    return NextResponse.json({ message: text }, { status: response.status })
  }

  return NextResponse.json(
    { message: "Request failed" },
    { status: response.status }
  )
}
