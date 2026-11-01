# Build status

_Last updated: 1 Nov 2026_

## Verification so far (read this first)

The code was written in a sandbox where the npm registry was blocked, so **dependencies have never been installed and the Next.js app has not yet been built or run**. What *was* verified there:

| Check | Result |
|---|---|
| Unit tests for all core logic (DSL validation/repair, patches, diffs, layout, Excalidraw adapter, scenes, formats, cameras, interpolation, SVG renderer, AI orchestration with repair loop, Ollama + Gemini providers, video job builder, landing-page diagrams) | **112 passing.** Run with a vitest-compatible harness, using locally available copies of zod v4 and a dagre port |
| Strict TypeScript on the core modules (real zod types) | **Clean** |
| TypeScript on the whole app (pages, components, routes) against stand-in stubs for third-party packages | **Clean.** This catches mismatched props, imports and signatures in our own code, but not misuse of third-party APIs |
| Supabase migrations + RLS on real PostgreSQL 16 (with auth/storage stubs) | **Passing:** isolation between users, blocked cross-user writes, anon access, RPCs, cascade deletes, worker job claiming |
| Presentation player, real React 19 in headless Chromium | **Working:** keyboard navigation, transitions, format switch, autoplay/pause, scene tabs; no console errors |
| SVG presentation output, 16:9 and 9:16 | Visually inspected |

**First things to run on your machine:** `bun install && bun run check`, then `bun dev` and walk the journey, then `bun run test:e2e`. The likeliest friction points are listed under *Known risks*.

## Changelog
- **1 Nov 2026 (fixes):** `bun dev` now raises Node's HTTP header limit to 64 KB, so a pile of `localhost` cookies no longer causes a 431 after Google sign-in. `<body>` ignores attributes added by browser extensions (the ColorZilla hydration warning). Added a Troubleshooting section to the README.
- **1 Nov 2026 (landing redesign):** The landing page is rebuilt around one continuous story, after reviewing what award-winning product sites do differently: one signature interaction, the real product as the hero, and scroll used to pace a story. A pinned Diagram Studio window follows the copy, and it carries the diagram the visitor picks in the hero (microservices, RAG, Kafka or JWT). The diagram draws itself; scrolling then applies an AI edit with a diff preview; the page "lights down" and the diagram plays as a presentation in step with the copy; finally it flips to 9:16. The exports section renders that topic's real outputs (16:9 video with a play button, the 9:16 Short, scene images, PNG/SVG/.excalidraw). The closing prompt box carries the visitor's text through Google sign-in into the new-diagram dialog (`LandingPromptPickup` on the dashboard, `LANDING_PROMPT_KEY` in localStorage, expires after 24 hours). Removed the old hero loop and separate edit/format demos. **Camera fix:** "auto" cameras now also frame routed edges, so sequence-diagram messages below the participants are no longer cut off by the caption. 16 new tests (`landing-topics.test.ts`).
- **1 Nov 2026 (auth + speed):** **Sign-out fixed.** It was a form inside a dropdown that unmounted before submitting; it's now a client handler that clears both the browser and server sessions. Sign-out is also on the Settings page. **Google sign-in replaces email/password and email confirmation.** Profiles are filled from Google's name and photo. **Faster navigation:** auth uses `getClaims()` (local JWT verification) instead of a round trip to Supabase Auth, deduplicated per request with React `cache()`; it previously made around four round trips per page. Dashboard thumbnails are smaller, the project list is capped at 120, and the remaining routes got loading states. **Sign-in stats:** `user_logins` table, plus `user_stats` and `users_overview` views (dashboard-only). **Settings → API keys** card for storing your own key; the AI provider card now only picks the provider and model.
- **1 Nov 2026 (launch prep):** New public landing page (`src/app/page.tsx`, `src/components/landing/*`, `src/app/landing.css`). The hero is a live demo driven by the real presentation engine: a prompt types itself, the RAG diagram sketches in, then plays as a presentation that switches from 16:9 to 9:16. Also an interactive "ask for changes" demo, a side-by-side formats stepper, features, BYOK/Ollama, FAQ and CTA. Global pause control, reduced-motion support, and responsive down to 390px. Added a social share image, `robots.txt` and `sitemap.xml`. Signed-in visitors now see the landing page with an "Open app" button instead of being redirected.
- **1 Nov 2026 (later):** Cloud AI is now **bring-your-own-key**: there is no app-wide Gemini key (`GEMINI_API_KEY` / `GEMINI_MODEL` removed). Users paste their own key in Settings → AI provider, which is verified with Google; then they choose from the Gemini models that key can use. Keys are encrypted with AES-256-GCM (`API_KEY_ENCRYPTION_SECRET`), stored in the new `user_ai_keys` table (owner-only RLS), and never returned to the browser. New routes: `GET/PUT/DELETE /api/ai/gemini`, `POST /api/ai/gemini/models`. Added 6 tests (95 unit tests total) and 2 RLS assertions.
- **1 Nov 2026:** First run on a hosted Supabase project failed with `Could not find the table 'public.projects'` because the migrations hadn't been applied. Added `supabase/setup.sql` (all migrations in one file, safe to re-run, verified by running it three times in a row), explicit Data API grants for newer projects, support for publishable/secret keys (legacy anon/service-role still accepted), and a setup screen (`SetupRequired`) that replaces the crash when the schema is missing. Docker is no longer needed: the README's quick start now targets a hosted project.

## Completed

### Phase 1: Foundation and diagram engine
- Next.js 16 App Router, TypeScript, Tailwind v4, shadcn-style UI kit (Radix), Lucide
- Supabase Auth: sign up, sign in, sign out, email-link callback/confirm, protected routes (`src/proxy.ts`), profile management
- Dashboard: sidebar, profile menu, recent + all projects, search, thumbnails, rename/duplicate/delete, empty state with example prompts
- Excalidraw integration (official React component) with autosave (debounced), save status, retry/backoff, local draft recovery, stale-write detection, Ctrl/⌘+S
- `DiagramDSL` + Zod schema with referential-integrity validation and limits; deterministic repair (`sanitizeDiagram`)
- Excalidraw adapter (`toExcalidrawElements`, `fromExcalidrawScene`, `updateExcalidrawScene`) with unit tests
- Layout engine: dagre (LR/TB, groups, edge-label spacing) and a sequence-diagram strategy, behind a strategy registry
- Ollama provider (browser → localhost, structured outputs, connection test, model check, timeouts, actionable errors) and Gemini provider (server-only, JSON schema output, retries, timeouts, usage)
- Generation workflow: prompt → structured output → validate/repair → layout → adapter → canvas → persisted with a version

### Phase 2: Diagram intelligence
- Natural-language modifications as patch operations; clarify/explain responses; selected-component context
- Diff preview with Apply/Discard; one-click undo; Excalidraw undo/redo; version history with non-destructive restore
- Highlighting, layout direction changes, type changes, simplification via AI; inspector panel for manual property edits

### Phase 3: Scene-based presentation
- Presentation/scene data model (`replace_scenes` RPC for atomic ordered saves)
- AI scene generation (invented ids are rejected and repaired) plus deterministic "Auto-build" (no AI needed)
- Scene builder: create, delete (with undo), duplicate, rename, reorder (drag-and-drop + keyboard), narration, duration, transition, visibility, highlight, dim, camera
- Transition preview; full-screen player (play/pause, prev/next, progress, keyboard, click-to-advance, auto-hiding controls)

### Phase 4: Multi-format presentation
- Independent landscape/portrait layouts sharing logical ids; landscape mirrors the editor, portrait gets its own vertical layout
- Per-format manual node positioning (drag in the studio), preserved on regeneration; explicit reset
- Per-format cameras; format switching in studio and player; captions laid out per format

### Phase 5: Export and deployment
- PNG, SVG, `.excalidraw`, project JSON, scene images (PNG+SVG zip)
- Remotion composition driven by the shared presentation model; background worker with job claiming, progress, upload to private storage, signed downloads, failure handling, stale-job recovery
- Export status UI with polling; Vercel deployment notes

## In progress
- Nothing. All phases are implemented and awaiting first install and run.

## Pending / future
- Browser-based presentation recording (PRD §12.3, explicitly a future module)
- Real-time collaboration, light/dark theming of presentation output, custom presentation themes
- Optional local companion service for Ollama (PRD §6.4: "do not make it a requirement for MVP")
- Storing thumbnails in Supabase Storage instead of a data URL column (see decisions)

## Known risks (untested against installed packages)
1. **Excalidraw 0.18 API details:** `restoreElements` options, `CaptureUpdateAction`, `exportToBlob` `getDimensions`. Code is defensive, but verify that generation, undo and export work.
2. **Undo/redo toolbar buttons** dispatch synthetic Ctrl/⌘+Z key events to Excalidraw (its history isn't on the public API). Keyboard undo works regardless.
3. **Package versions** use caret ranges (`next ^16`, `@excalidraw/excalidraw ^0.18`, `zod ^4`, `@supabase/ssr ^0.7`, `lucide-react ^0.460`). If install resolves something incompatible, pin to the latest of those majors.
4. **ESLint:** React-Compiler-era rules from newer `eslint-plugin-react-hooks` are downgraded to warnings in `eslint.config.mjs`.
5. **Gemini:** uses `responseJsonSchema` and falls back automatically to plain JSON mode if the model rejects it. Model listing relies on `GET /v1beta/models` returning `supportedGenerationMethods`.
6. **Ollama from an HTTPS site:** depends on the user setting `OLLAMA_ORIGINS` and the browser allowing local network access. The UI explains both.

## Technical decisions
- **Ollama runs from the browser**, so it works for a hosted SaaS without a companion app. The orchestrator is isomorphic: the same prompts, schemas and validation run in the browser (Ollama) and on the server (Gemini).
- **Patch operations, not regenerated diagrams**, for modifications. Determinism preserves ids and positions; the model never sees coordinates.
- **Adapter writes full native elements** (deterministic ids, `customData` bookkeeping). In the browser they then go through Excalidraw's own `restoreElements` for text metrics and bindings, which keeps the adapter pure and unit-testable.
- **One renderer for presentations** (pure SVG string), shared by player, studio, scene images and Remotion, giving identical output everywhere.
- **Format layouts are recomputed on load** (landscape from the editor canvas, portrait automatically) with manual positions overlaid. Edits in the editor show up in presentations, and manual tweaks survive.
- **Thumbnails are small WebP data URLs** on `projects.thumbnail_url` (≤ 300 KB, enforced by a CHECK constraint). This avoids a storage round-trip per save; Storage is used for videos.
- **Bring-your-own Gemini key, kept server-side:** the user's key is encrypted at rest and only decrypted inside route handlers. This keeps the PRD rule that cloud keys never reach the browser, works across devices, and keeps usage tracking and rate limits. Changing `API_KEY_ENCRYPTION_SECRET` invalidates saved keys; users are told to re-enter them.
- **Rate limiting uses the `ai_usage` table**, which works across serverless instances without Redis.
- **Schema setup without Docker:** `supabase/setup.sql` mirrors `supabase/migrations/` and is idempotent (`if not exists`, `drop … if exists`), so it can be pasted into the SQL Editor; `supabase db push` remains an option.
- **Versions are explicit snapshots** (AI changes, restores, "Save version", manual edits preceding an AI change), not every autosave.

## Next implementation tasks
1. `bun install && bun run check`; fix anything the real type definitions or lint surface.
2. Apply `supabase/setup.sql` in the hosted project's SQL Editor, then walk the PRD §24 journey with both providers.
3. `bun run test:e2e`.
4. Deploy to Vercel + hosted Supabase; deploy the render worker; test an MP4 render end to end.
