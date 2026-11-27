import { proxyBackend } from "@/lib/proxy-backend"

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  return proxyBackend(request, `/media/${id}/renders`)
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  return proxyBackend(request, `/media/${id}/renders`)
}
