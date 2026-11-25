import { proxyBackend } from "@/lib/proxy-backend"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  return proxyBackend(request, `/clips/${id}`)
}
