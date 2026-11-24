export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

/** Reads the API error envelope `{ message, errors?, code? }`. */
export async function parseApiError(
  response: Response,
  fallbackMessage: string
): Promise<ApiError> {
  let message = fallbackMessage
  let code: string | undefined

  try {
    const payload = await response.json()
    if (typeof payload?.message === "string" && payload.message.trim()) {
      message = payload.message
    }
    if (typeof payload?.code === "string") {
      code = payload.code
    }
    const fieldErrors = payload?.errors
    if (fieldErrors && typeof fieldErrors === "object") {
      const details = Object.entries(fieldErrors)
        .map(([field, error]) => `${field} ${error}`)
        .join(", ")
      if (details) message = `${message}: ${details}`
    }
  } catch {
    // empty / non-JSON
  }

  return new ApiError(message, response.status, code)
}
