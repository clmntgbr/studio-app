import { proxyBackend } from "@/lib/proxy-backend"

export async function GET(request: Request) {
  return proxyBackend(request, "/projects")
}

export async function POST(request: Request) {
  return proxyBackend(request, "/projects")
}
