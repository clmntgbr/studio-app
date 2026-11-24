import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a millisecond duration: "1.5s", "27s", "7m 24s", "1h 2m". */
export function formatDurationSeconds(ms: number | null | undefined): string {
  if (ms == null) return "—"
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 10) return `${(ms / 1000).toFixed(1)}s`
  if (total < 60) return `${total}s`
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) {
    return seconds > 0
      ? `${hours}h ${minutes}m ${seconds}s`
      : minutes > 0
        ? `${hours}h ${minutes}m`
        : `${hours}h`
  }
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}
