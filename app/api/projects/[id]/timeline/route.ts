import { proxyBackend } from "@/lib/proxy-backend"

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  return proxyBackend(request, `/projects/${id}/timeline`)
}
