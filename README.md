# Studio App

Next.js front for **Studio**: projects, media pipeline status, and the **Clip Factory** timeline editor (Render master + selected vertical clips).

API: sibling repo `studio-api` (default `http://localhost:4000`).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Clerk auth
- Tailwind CSS 4 + shadcn/ui
- TanStack Query + Centrifugo realtime

## Setup

```bash
npm install
```

`.env` / `.env.local`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:4000
NEXT_PUBLIC_CENTRIFUGO_URL=ws://localhost:8000/connection/websocket
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/account/setup
```

```bash
npm run dev
```

App: [http://localhost:3001](http://localhost:3001).

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Dev server on `3001` (Turbopack) |
| `npm run build` / `start` | Production |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc` |

## Clip Factory editor

Route: project timeline / edit UI (`components/editor/timeline-editor.tsx`).

| Control | Persistence | Behaviour |
| --- | --- | --- |
| Format (output preset) | `media_configuration.output_preset_id` | Restored on reload |
| Incruster les SRT | `media_configuration.burn_subtitles` | Burn ASS into master + selected clips |
| Split master | `media_configuration.master_split` | `parts:N` or `durationMs:N` after master encode |
| Clip checkboxes | `clip.selected` | Included in Render as vertical encodes |
| Render | — | Master (`force`) then clips **sequentially**; downloads via `/api/renders/:id/download` (+ `?part=`) |

Silence / cut density opens the silence drawer and may reanalyze (`silence` + `text`) then wait for timeline rebuild over realtime.

## API proxy

Browser calls same-origin `/api/...` routes that forward to the Go API with the Clerk token (including **binary download** for renders so MinIO presign is not required in the browser).

## Layout (high level)

```text
app/(private)/          # projects, media, editor
app/api/                # BFF proxies to studio-api
components/editor/      # Clip Factory UI
lib/media/              # media + configuration + clips
lib/output-presets/     # presets, render, download
lib/timeline/           # timeline queries / preview
lib/realtime/           # Centrifugo connection
```
