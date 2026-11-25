import { proxyBackendBinary } from "@/lib/proxy-backend-binary"

type Params = { params: Promise<{ id: string }> }

/** Same-origin authenticated download → studio-api MinIO proxy. */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  return proxyBackendBinary(request, `/renders/${id}/download`)
}
