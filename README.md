# Scriptoon

AI-powered screenwriting platform. Generate, extend, and export professional movie scripts with AI — including movie cover art, NSFW controls, marketplace listings, and tier-based plans (Free / Pro / Premium).

Live: https://scriptoon.lovable.app

---

## Tech Stack

- **Frontend:** React 18 + Vite 5 + TypeScript 5
- **Styling:** Tailwind CSS v3 + shadcn/ui (Radix primitives)
- **Routing:** React Router v7
- **State/Data:** TanStack Query, React Hook Form + Zod
- **Backend:** Lovable Cloud (Supabase: Postgres, Auth, Storage, Edge Functions)
- **AI:** Lovable AI Gateway (Gemini 2.5 Flash for text, Gemini 2.5 Flash Image for covers)
- **Exports:** `jspdf` (PDF), `docx` (DOCX), `file-saver`

---

## Project Structure

```
.
├── src/
│   ├── components/         # UI + feature components (CoverGenerator, TryItDemo, etc.)
│   ├── contexts/           # AuthContext
│   ├── hooks/              # Custom hooks
│   ├── integrations/
│   │   └── supabase/       # AUTO-GENERATED — do not edit
│   │       ├── client.ts
│   │       └── types.ts
│   ├── lib/                # plan-limits, screenplay-pdf, screenplay-docx, usage, utils
│   ├── pages/              # Route components
│   ├── index.css           # Design tokens (HSL semantic colors)
│   └── main.tsx
├── supabase/
│   ├── config.toml         # Edge function config (e.g. verify_jwt for try-script)
│   ├── functions/          # Edge functions (generate-script, extend-script, generate-cover, try-script, momo-request-payment, notify-admins)
│   └── migrations/         # SQL migrations (timestamped, append-only)
├── public/                 # Static assets
├── index.html
├── tailwind.config.ts
├── vite.config.ts
└── package.json
```

---

## Environment Variables

The `.env` file is **auto-generated and managed by Lovable Cloud**. Do not edit it manually. It contains:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Backend (Supabase) project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key — safe in client code |
| `VITE_SUPABASE_PROJECT_ID` | Backend project ref |

### Edge Function Secrets (set in Lovable Cloud → Settings → Secrets)

| Secret | Used by | Purpose |
|---|---|---|
| `LOVABLE_API_KEY` | All AI edge functions | Lovable AI Gateway access (managed automatically) |
| `SUPABASE_URL` | Edge functions | Auto-injected |
| `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` | Edge functions | Auto-injected |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions | Auto-injected — privileged DB access |
| `MOMO_*` (if using mobile money) | `momo-request-payment` | MoMo API credentials |

> Publishable / anon keys are public by design and may live in code. Service role keys and provider secrets must **never** be committed.

---

## Run Locally

### Prerequisites

- Node.js **18+** (or Bun)
- A Lovable Cloud project (or your own Supabase project) with the migrations in `supabase/migrations/` applied

### Steps

```bash
# 1. Install dependencies
npm install
# or: bun install

# 2. Create .env (only needed when running outside Lovable)
cat > .env <<EOT
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_REF
EOT

# 3. Start dev server
npm run dev
# → http://localhost:8080
```

### Tests / Lint

```bash
npm run lint
npm run test
```

---

## Backend Setup (self-hosted Supabase)

If you're not using Lovable Cloud:

1. Create a Supabase project at https://supabase.com
2. Apply migrations:
   ```bash
   npx supabase link --project-ref YOUR_REF
   npx supabase db push
   ```
3. Deploy edge functions:
   ```bash
   npx supabase functions deploy generate-script
   npx supabase functions deploy extend-script
   npx supabase functions deploy generate-cover
   npx supabase functions deploy try-script --no-verify-jwt
   npx supabase functions deploy momo-request-payment
   npx supabase functions deploy notify-admins
   ```
4. Set secrets in Supabase Dashboard → Edge Functions → Secrets:
   - `LOVABLE_API_KEY` (or swap calls to your own AI provider)
   - any payment provider keys
5. Create the `script-covers` storage bucket (public read).

---

## Production Deployment

### Option A — Lovable (recommended)

1. Open the project in Lovable.
2. Click **Publish** (top-right).
3. App is live at `https://<your-project>.lovable.app`.
4. **Edge functions and database migrations deploy automatically** on save.
5. Frontend changes require clicking **Update** in the publish dialog.
6. Add a custom domain via **Project Settings → Domains** after first publish.

### Option B — Self-host frontend

```bash
npm run build      # outputs to dist/
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages, S3+CloudFront). Ensure SPA fallback is enabled (rewrite all paths to `/index.html`). Backend (edge functions + DB) still runs on Supabase.

---

## Plan Tiers

| Feature | Free | Pro | Premium |
|---|---|---|---|
| Script length | ~12 pages | ~60 pages | ~500 pages |
| Extend script | 1 / 24h | unlimited | unlimited |
| NSFW scenes | 1 / 24h | 3 / 24h | unlimited |
| Movie covers | — | 3 / 24h | unlimited |

---

## Important Notes

- **Never edit** `src/integrations/supabase/client.ts` or `src/integrations/supabase/types.ts` — auto-generated.
- **Never edit** existing files in `supabase/migrations/` — create new timestamped migrations.
- All UI colors must use semantic tokens from `src/index.css` and `tailwind.config.ts` (HSL only).
- Routing uses `BrowserRouter`; SPA fallback is required on any custom host.

---

## License

Proprietary — © Scriptoon.
