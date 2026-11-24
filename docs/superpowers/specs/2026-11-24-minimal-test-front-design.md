# Minimal test front — design

Nov 24, 2026

## Goal

Smoke-test studio-api from `studio-app`: projects, from-url, multipart upload, media steps. TanStack Query like uptime-app. No editor, no Centrifugo polish.

## Stack

- Next.js App Router + Clerk (existing)
- `@tanstack/react-query` with `lib/query/{client,provider,keys}`
- BFF `app/api/**` via `proxyBackend` (Clerk token server-side)
- Domain modules: `lib/user`, `lib/projects`, `lib/media` (`types` / `api` / `hooks`)

## Pages

| Route | Behavior |
| --- | --- |
| `/` | List + create project |
| `/projects/[id]` | Media list, from-url form, file upload |
| `/media/[id]` | Status + steps (poll while processing) |

## Upload flow

`POST …/media/uploads` → PUT parts to MinIO presigned URLs → `POST …/uploads/complete` with ETags. Prefer few parts (5 MiB) for smoke tests.

## Non-goals

Video editor, realtime Centrifugo UI, clips/renders screens, design system polish.
