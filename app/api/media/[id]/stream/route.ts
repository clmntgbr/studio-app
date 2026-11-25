import { proxyBackendBinary } from "@/lib/proxy-backend-binary"

type Params = { params: Promise<{ id: string }> }

/** Same-origin video stream → studio-api MinIO proxy (Range-aware). */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  return proxyBackendBinary(request, `/media/${id}/stream`)
}
