# Copilot / AI assistant instructions for MedSafe-UDI

Purpose: Give a compact, actionable orientation so an AI coding agent can be productive immediately in this Next.js + Supabase project.

- Big picture:
  - This is a Next.js (App Router) frontend + serverless API routes project (Next 16, React 19).
  - Supabase is the primary backend: authentication (magic-link), Storage buckets and a Postgres database via `supabaseAdmin` on the server.
  - UI is client-heavy React components (use `"use client"`) with Tailwind styles. Layout and routes live under `app/`.

- Key files to inspect before making changes:
  - `lib/supabaseClient.ts` — client-side Supabase usage for browser auth and requests.
  - `lib/supabaseServerClient.ts` — server-side Supabase client; requires `SUPABASE_SERVICE_ROLE_KEY` and will throw if missing.
  - `app/api/*.ts` — server endpoints. Notable routes:
    - `app/api/upload/route.ts` — file upload into storage bucket `docs`, returns `{ cid, url }`.
    - `app/api/qms-documents/route.ts` — QMS document upload into bucket `documents` and inserts metadata into `documents` table.
  - `app/components/AuthBar.tsx` and `app/components/Sidebar.tsx` — example client components using Supabase auth and session listeners.

- Environment & runtime notes (important):
  - Client env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used in `lib/supabaseClient.ts`).
  - Server env vars: `SUPABASE_SERVICE_ROLE_KEY` (used in `lib/supabaseServerClient.ts`). The server code throws on missing server key.
  - API routes set `export const runtime = "nodejs";` and `export const dynamic = "force-dynamic"` — treat these routes as server-side, Node runtime code.

- Data flows & invariants worth preserving:
  - File uploads: endpoints expect `FormData` with a `file` Blob. They convert Blob -> Buffer and upload to Supabase Storage.
  - `qms-documents` route computes SHA256 and manages `documents` DB table: it sets previous rows' `is_current=false` then inserts the new record. If you change this, ensure versioning semantics remain intact.
  - Frontend expects `{ cid, url }` shape from `upload/route.ts`.

- Conventions and patterns in this repo:
  - TypeScript with explicit client/server separation: files/components that run in browser include `"use client"` at top.
  - Supabase auth uses Magic Link (`signInWithOtp`) and `supabase.auth.onAuthStateChange` listeners in UI.
  - Storage buckets used: `docs` (general uploads) and `documents` (QMS document versions).
  - Keep UI code inside `app/` and API logic inside `app/api/` following Next App Router conventions.

- Scripts and dev workflow:
  - Start dev server: `npm run dev` (maps to `next dev`).
  - Build: `npm run build`; start production server: `npm run start`.
  - Lint: `npm run lint` runs `eslint` using `eslint.config.mjs`.

- What an AI should NOT change without explicit instruction:
  - Do not replace the Supabase server client key handling — missing server key intentionally throws to prevent unsafe server-side execution.
  - Do not change the storage bucket names (`docs`, `documents`) or the shape of responses expected by the frontend unless you update all callers.
  - Avoid changing runtime flags (`runtime = "nodejs"`, `dynamic = "force-dynamic"`) for API routes unless you understand Next runtime implications.

- Examples of safe, high-value edits an AI can make autonomously:
  - Small bugfixes that preserve existing API shapes (e.g., tighten null checks, improve error messages in routes).
  - Add input validation or early returns in API routes that maintain existing response formats.
  - Add TypeScript types to request handlers and helper functions for clarity.

- Examples of tasks that need human review / PR description:
  - Any change that alters API response shapes, bucket names, DB schema, or environment var names.
  - Changes to authentication flows (e.g., switching provider types or session persistence).

- Good anchors for code references in PRs or messages:
  - Upload flow: `app/api/upload/route.ts`
  - QMS document flow: `app/api/qms-documents/route.ts`
  - Client vs server supabase usage: `lib/supabaseClient.ts`, `lib/supabaseServerClient.ts`

If anything in these notes seems incomplete or you want more examples (DB schema, additional routes, or common test steps), reply and I'll expand this file with targeted snippets and commands.
