# Aptly — find jobs you fit

> "Stop applying everywhere. Start applying where you fit."

A privacy-first SaaS that reads a job seeker's resume, pulls legitimate remote jobs straight from employers' own job boards, scores fit with a transparent rule-based engine, and helps prepare honest, tailored applications. It never auto-applies and never invents experience.

The brand name lives in one place: `src/lib/config.ts` (`site.name`).

## Features

| Area | What it does |
|---|---|
| Auth | Email/password, Google OAuth, password reset (Supabase Auth) |
| Resume | PDF/DOCX upload (type sniffed from bytes, 5 MB max), private storage, text extraction |
| Resume intelligence | Claude extracts a structured profile; every fact is checked against the resume text and labelled **From resume / Inferred: please check / Added by you**. Falls back to a rule-based parser with no API key |
| Career profile | Review and edit skills, roles, education, country, work authorisation, sponsorship, remote preference, salary, languages |
| Job ingestion | 49 seeded sources: employer boards on Greenhouse, Lever and Ashby (official links), plus Remote OK and Arbeitnow (credited, linked back). Adzuna and schema.org careers-page crawling (robots.txt-aware) can be added from Admin |
| Normalisation | Titles, employers, remote type and eligible regions (e.g. "Remote, EMEA", "AMER", "Home based"), salary, dates, listing language |
| Verification | Official vs job-board links, stale or expired listings, missing links, duplicates across sources, scam patterns (fees, Telegram/WhatsApp-only contact, gift cards, unrealistic salaries) |
| Matching | Explainable 0–100 score: skills 45, role relevance 15, seniority/years 15, location/remote 10, education 5, eligibility (authorisation + language) 5, industry 5. Hard blockers (e.g. "US only" for someone in Lagos) cap the score; every cap is shown with its reason |
| Application builder | Requirement → evidence table, tailored resume, cover letter, likely questions, missing info, final checklist, official apply link. Employers, titles and dates always come from the profile; a fabrication guard removes or flags unsupported figures, skills and inflated years |
| Export | Copy, Word (.docx), plain text |
| Tracker | Interested → Preparing → Applied → Interviewing → Outcome |
| Privacy | Download all data (JSON), delete resume data, auto-delete files after 30/90/180/365 days, delete account |
| Admin | Source health, run now, enable/disable, add sources, ingestion runs, failed tasks, AI cost |
| Limits | Free: 3 resume analyses and 3 tailored applications a month; Pro limits and credits in `src/lib/config.ts` (payments not wired yet) |

## Architecture

- **Next.js 15** (App Router, TypeScript, Tailwind v4), deployed to **Cloudflare Workers** with OpenNext
- **Supabase**: Postgres (+ pgvector, pg_trgm), Auth, private Storage, row-level security on every table
- **AI layer** (`src/lib/ai/provider.ts`): provider-agnostic `generateStructured()` with forced tool calls and Zod validation. Ships with Claude (`claude-sonnet-5-5` for parsing and tailoring, `claude-haiku-4-5` for job analysis). Every call is logged with token counts and cost
- **Background work**: a Postgres task queue (`claim_tasks` with `SKIP LOCKED`), worked by `scripts/worker.mts` on a GitHub Actions schedule every 30 minutes (so heavy ingestion never runs on the Worker). `/api/cron/tick` does the same over HTTP if you prefer

```
src/lib/
  jobs/        connectors, http (polite fetch, robots.txt), normalize, requirements, verify
  matching/    engine (scoring), role-families, industries
  resume/      extract-text, heuristic parser, AI parser + verification
  tailoring/   generate (AI + template), guard (fabrication checks)
  services/    ingest, matching, candidate, resume, tailoring, usage, privacy, worker
supabase/
  migrations/  schema, RLS, storage, functions
  seed.sql     job sources
  tests/       RLS test suite + Supabase stubs for plain Postgres
```

## Local setup

1. `npm install`
2. Create a Supabase project, or run `supabase start` with the Supabase CLI.
3. Apply the database: `supabase db push` (or run `supabase/migrations/*.sql` in order in the SQL editor), then run `supabase/seed.sql`.
4. `cp .env.example .env.local` and fill it in (see below).
5. `npm run dev` and open http://localhost:3000.
6. Load jobs: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/tick?limit=10"` (run it a few times), or use **Admin → Run now**.
7. Make yourself admin: `update profiles set role = 'admin' where email = 'you@example.com';`

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server only. Used for ingestion, matching and usage records |
| `NEXT_PUBLIC_SITE_URL` | yes | Used in auth email links |
| `CRON_SECRET` | yes | Shared secret for `/api/cron/tick` |
| `ANTHROPIC_API_KEY` | no | Without it the app uses the rule-based parser and template drafts |
| `AI_PROVIDER` | no | `anthropic` (default) or `none` |
| `AI_MODEL`, `AI_MODEL_FAST` | no | Override the models |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | no | Only if you add an Adzuna source |

### Supabase auth settings

- **Site URL**: your production URL. **Redirect URLs**: `https://your-domain/auth/callback` and `https://your-domain/auth/confirm`.
- Email templates: point the confirm and reset links to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=...`.
- Google: enable the provider and add the Google OAuth client ID and secret.

## Tests

```
npm test            # 42 unit tests: matching, extraction, verification, robots.txt, resume parsing, fabrication guard
npm run test:db     # applies all migrations to a throwaway Postgres 16 + pgvector and runs the RLS suite
npm run typecheck
npm run check:sources   # fetches live listings from a few sources and prints what was extracted
```

CI (`.github/workflows/ci.yml`) runs all of these plus a production build.

## Deploying to Cloudflare

1. `npx wrangler login`
2. Add secrets: `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` (repeat for `CRON_SECRET`, `ANTHROPIC_API_KEY`). Set `NEXT_PUBLIC_*` values in the build environment.
3. `npm run deploy`
4. In GitHub, add repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The **Background worker** workflow then refreshes jobs every 30 minutes.

The Workers Free plan allows only 10 ms of CPU per request. Resume upload and matching can exceed that, so use **Workers Paid** ($5/month) for real users.

## Job data compliance

- Employer boards (Greenhouse, Lever, Ashby) are public APIs that employers publish for this purpose. Their listings link to the official application page.
- **Remote OK** requires a followed link back and credit. Listings show the source and link to Remote OK.
- **Remotive** is seeded **disabled**: its terms forbid showing its jobs behind a sign-up wall.
- The careers-page crawler only fetches pages robots.txt allows, one at a time, with a delay.
- LinkedIn, Indeed and similar boards are not scraped.

## Known gaps / next steps

- Payments (Stripe or Paystack) for Pro and credits. The `subscriptions` table and limits are already in place.
- Embedding-based semantic matching (the `embedding` columns exist; scoring is rule-based today).
- The privacy notice and terms are templates. Have them reviewed before launch.
- Phase 2 features from the brief (alerts, interview prep, salary insights) are not built.
