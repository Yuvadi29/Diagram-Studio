# Diagram Studio

**Turn complex ideas into visual stories.**

Describe a technical concept in plain language. Diagram Studio generates a structured, editable [Excalidraw](https://excalidraw.com) diagram, lets you refine it by hand or with AI, and turns it into a scene-by-scene presentation in **16:9** and **9:16**, ready to present, record or export as images and MP4.

- **AI diagram generation:** prompt → validated `DiagramDSL` → deterministic layout → native Excalidraw elements
- **Editable by default:** the real Excalidraw editor, with autosave, version history and undo
- **AI modifications that preserve your work:** structured patch operations, previewed as a diff before they're applied; untouched nodes keep their positions and styling
- **Local or cloud AI:** Ollama (runs in your browser against your own machine) or Gemini (server-side); never switches silently
- **Scene-based presentations:** progressive reveal, highlight/dim, per-format cameras, fade/zoom transitions, a full-screen player with keyboard control
- **Two first-class formats:** landscape and portrait get independent layouts that share the same logical ids; manual adjustments are never discarded
- **Exports:** PNG, SVG, `.excalidraw`, scene images (zip), project JSON, MP4 via a background Remotion worker

---

## Quick start

**Prerequisites:** [Bun](https://bun.sh) ≥ 1.2 (or Node ≥ 20.9 + npm) and a free [Supabase](https://supabase.com) project. No Docker needed.

1. **Install:** `bun install`
2. **Create the database schema (one time).** In the Supabase dashboard, open **SQL Editor → New query**, paste the whole of [`supabase/setup.sql`](supabase/setup.sql), and click **Run**. It's safe to run again.
   *CLI alternative:* `npx supabase link --project-ref <ref>` then `npx supabase db push` (applies `supabase/migrations/`; also no Docker).
3. **Configure auth.** Go to **Authentication → URL Configuration**. Set *Site URL* to `http://localhost:3000` (your deployed URL later) and add `http://localhost:3000/auth/callback` to *Redirect URLs*. Email confirmation can stay on; sign-up then sends a confirmation link.
4. **Environment:** `cp .env.example .env.local`, then fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API Keys). Add `GEMINI_API_KEY` for cloud AI.
5. **Run:** `bun dev`, then open http://localhost:3000.

Sign up, click **Create new diagram**, and try *“Explain how a RAG architecture works.”* If you skipped step 2, the app shows a setup screen with a direct link to your project's SQL Editor instead of an error.

> Prefer a fully local stack? `supabase start` (needs Docker) followed by `supabase db reset` works too; use the URL and keys from `supabase status`.

### Cloud AI (Gemini)

Set `GEMINI_API_KEY` (from [Google AI Studio](https://aistudio.google.com/apikey)) and optionally `GEMINI_MODEL` (default `gemini-3.8-flash`). The key is only read by server route handlers and is never sent to the browser. Requests are rate-limited per user (`AI_RATE_LIMIT_PER_10_MIN`, `AI_RATE_LIMIT_PER_DAY`), and usage is recorded in `ai_usage`.

### Local AI (Ollama)

Diagram Studio is a hosted web app, and a server can't reach Ollama on *your* laptop. Instead, **your browser talks to your local Ollama directly**, and the server never proxies these calls.

1. Install [Ollama](https://ollama.com) and pull a model that's good at JSON: `ollama pull llama3.1` (or `qwen2.5`).
2. Allow the app's origin (replace with your deployment URL, or `http://localhost:3000` locally):
   - macOS app: `launchctl setenv OLLAMA_ORIGINS "https://your-app.example.com"`, then quit and reopen Ollama
   - CLI / Linux / Windows: `OLLAMA_ORIGINS="https://your-app.example.com" ollama serve`
3. In **Settings → AI provider**, choose *Local Ollama*, click **Test**, pick a model, and save.

If Ollama is unreachable or the model is missing, you get a clear error with the fix. The app never falls back to cloud AI without you choosing it. Chrome may ask once for permission to access devices on your local network when an HTTPS site calls `localhost`; allow it.

---

## How it works

```
prompt ──► AI provider (Ollama in browser | Gemini on server)
             │  structured JSON (schema-constrained)
             ▼
        sanitize + Zod validation ──(invalid? feed errors back once)──► DiagramDSL
             │
             ▼
        layout engine (dagre / sequence)   ← deterministic, never the LLM
             │
             ▼
        Excalidraw adapter  ◄────────────► Excalidraw scene (editable canvas)
             │                                  ▲ manual edits flow back into the DSL
             ▼
        presentation model (per format) ──► SVG renderer ──► player · scene images · Remotion MP4
```

| Module | Responsibility |
|---|---|
| `src/features/diagrams` | `DiagramDSL` schema (Zod), deterministic repair, patch operations, diffs, versioning |
| `src/features/layout` | Pluggable layout strategies (dagre for graphs, a dedicated sequence layout) |
| `src/features/excalidraw/adapter` | Pure DSL ⇄ Excalidraw conversion: deterministic ids, position/style preservation, no duplicates |
| `src/features/excalidraw/services` | The only code that touches the live Excalidraw API |
| `src/features/ai` | Provider abstraction, Ollama + Gemini transports, prompts, structured-output schemas, validate/repair loop, rate limits, usage |
| `src/features/presentations` | Scene schema, auto-generation, reconciliation, format layouts, cameras, frame interpolation, SVG renderer |
| `src/features/exports` | Client exports (scene images, JSON), Remotion composition, background render worker |
| `src/app/api` | Authenticated route handlers (projects, diagrams, versions, presentations, scenes, AI, exports, profile) |
| `supabase/migrations`, `supabase/setup.sql` | Schema, RLS policies, RPCs (`create_project`, `duplicate_project`, `replace_scenes`, `claim_export_job`), storage bucket |

**Two representations, kept in sync.** The DSL is the logical source of truth; the Excalidraw scene is the canvas. Generated elements carry `customData.dsKind/dsId`, so re-syncing updates elements in place instead of duplicating them. Labelled shapes and bound arrows you draw by hand become DSL nodes and edges automatically.

**Preserving manual work.** AI refinements are patch operations (`add_node`, `remove_edge`, `set_layout`, …) applied deterministically. Existing nodes keep their position, size and colours. New nodes are placed next to their neighbours without overlapping. Everything is re-laid-out only when you explicitly ask for it (layout direction change or *Tidy up layout*). Every AI change is previewed as a diff, creates a version, and can be undone with one click or with Ctrl/⌘+Z.

**Presentations are independent of the editor.** The player, scene-image export and video renderer all consume one serialisable `PresentationModel` and render it with a pure SVG function, so playback and video output match frame for frame.

---

## Video export (MP4)

Rendering is a **background job**; it never runs inside a Next.js request.

1. The UI queues a row in `exports` (`POST /api/exports`).
2. The worker claims it (`claim_export_job`, `FOR UPDATE SKIP LOCKED`), renders with Remotion, uploads to the private `exports` bucket, and updates status/progress.
3. The UI polls and offers a signed, time-limited download link.

Run the worker on any machine with Node, outside Vercel (a small VM, Railway, Fly.io…):

```bash
bun run worker:render      # needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY in .env.local
```

Remotion downloads a headless Chrome on first use, or you can set `REMOTION_BROWSER_EXECUTABLE`. Preview the composition with `bun run remotion:studio`. Note that Remotion has its own [license terms](https://www.remotion.dev/license) for companies.

---

## Scripts

| Command | What it does |
|---|---|
| `bun dev` / `bun run build` / `bun start` | Next.js dev server / production build / serve |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint (Next.js core-web-vitals + TypeScript) |
| `bun run test` | Vitest unit tests (DSL, adapter, layout, scenes, formats, renderer, AI orchestration, providers) |
| `bun run test:e2e` | Playwright end-to-end journey (needs the app running + local Supabase; uses a built-in fake Ollama) |
| `bun run check` | typecheck + lint + unit tests |
| `tests/integration/rls/run.sh` | Migrations + Row-Level-Security tests against any Postgres (`PGHOST`, `PGPORT`, `PGUSER`) |
| `bun run worker:render` | Background MP4 render worker |

---

## Deploying to Vercel

1. Import the repo into Vercel (framework: Next.js; install command `bun install`).
2. Set the environment variables from `.env.example`. **`SUPABASE_SECRET_KEY` is not needed by the web app**, so leave it out of Vercel; only the render worker uses it.
3. Set `NEXT_PUBLIC_APP_URL` and update Supabase's Site URL / redirect URLs.
4. Run the render worker separately if you want MP4 export.

Vercel limits request bodies to ~4.5 MB. Diagrams are typically a few hundred KB, but canvases with large embedded images can exceed that.

## Security

- Row Level Security on every user-owned table; ownership is also checked through parent rows (diagrams → projects, scenes → presentations). The RLS test suite proves another user can't read or write anything.
- All API routes authenticate with the user's session; Postgres enforces RLS on every query.
- Cloud AI keys and the service-role key are server-only (`server-only` guards).
- All AI output is parsed with Zod and validated for referential integrity; no model output is ever executed.
- Request size limits and input validation on every route; per-user AI rate limits backed by the database.

## Project structure

```
src/
  app/            routes: (auth), (dashboard), editor/[projectId], editor/[projectId]/present,
                  presentation/[presentationId], api/*
  components/     ui/ (shadcn-style primitives), dashboard/, editor/, presentation/, ai/, shared/
  features/       diagrams/, ai/, excalidraw/, layout/, presentations/, exports/
  lib/            supabase/, auth/, data/, utils/
supabase/         migrations/, seed.sql, config.toml
tests/            unit/, integration/rls/, e2e/, fixtures/
```

See `BUILD_STATUS.md` for progress, decisions and known limitations.
