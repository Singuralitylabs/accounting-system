# CLAUDE.md

Guidance for Claude Code in this repository. Product: accounting system of 未来技術推進協会 (Japanese UI, JST, JPY).

## Language policy

- `CLAUDE.md` is English (read only by AI). `docs/` and `README.md` stay Japanese (humans read them). Issue / PR templates stay Japanese.
- UI text, user-facing error messages and test names (`describe` / `it`) stay Japanese.
- Code comments are English (see Comment policy). Commit messages and PR titles / bodies are Japanese.

## Commands

```bash
yarn dev | build | lint | typecheck | test | test:watch | format | format:check
yarn db:types          # generate types from production Supabase (PROJECT_ID in .env.local)
yarn db:types-local    # generate types from local Supabase
supabase start | stop | reset   # local Supabase (reset re-applies supabase/migrations/)
```

- After any schema change run `yarn db:types-local` and update `app/lib/database.types.ts`.
- Schema changes (tables / RLS / triggers / enums / seed data) **must** be added as `supabase/migrations/YYYYMMDDHHMMSS_<snake_case_name>.sql`. Changes applied directly to a remote must be back-filled as a migration so `supabase db reset` reproduces the same state.
- Update `docs/database.md` in the same PR only when a table's role, an RLS intent, or a trigger / function purpose changes (no column lists or SQL there).
- Tests are Vitest under `tests/` (`*.test.ts` pure functions, `*.test.tsx` components with jsdom, TZ=Asia/Tokyo). See `docs/testing.md` for policy; update tests when you change tested code.
- CI is GitHub Actions in `.github/workflows/` (typecheck+lint / test / build / format-check). `supabase-keepalive.yml` only prevents the free-plan auto-pause (see `docs/setup.md`). Releases: `release-pr.yml` / `create-release.yml`, procedure in `docs/release.md`.

## Working rules

- Committing / pushing to a working branch needs no confirmation, but run `yarn typecheck && yarn lint && yarn test && yarn build && yarn format:check` locally **before every push**.
- Never push directly to `main`; go through a working branch + PR.
- **`release` (production) is reached only via `main`.** PRs target `main`; never open a PR from a working branch to `release`. Only the `main` → `release` release cut updates `release` (production hotfixes also land on `main` first).
- **Never merge PRs** (`gh pr merge`, GitHub MCP merge, merge / push to `main`). Only the user merges. Your scope ends at green CI + completed review.
- Production release follows `docs/release.md`. The release PR and tag are created by GitHub Actions; applying migrations to the production DB (`supabase db push`) is manual; no workflow runs it.

## Comment policy

- **Delete**: explanations the code already shows; history (issue numbers, past implementations, "previously ...", investigation logs — git log / PRs have it); JSDoc that only restates a type or function name.
- **Keep (concise English)**: the why; invariants that break if violated (ordering, timing, concurrency); library pitfalls; security reasons.
- Applied migrations under `supabase/migrations/` are history: don't edit their SQL comments. New migrations use English comments.
- Docs: keep only what code can't tell (business rules, permission intent, operating procedures, pitfalls). Put each fact in one canonical place and link to it elsewhere.

### Glossary (Japanese → English; match existing identifiers)

案件 = matter / 経理申請 = accounting request / 経理確認完了 = accounting confirmed / 差し戻し = sent back (edited after accounting request) / 事前収支申告 = budget declaration / 経理追加収支 = extra entry / 損益計算書 = profit and loss statement / 月次収支確定 = monthly closing / 定期費用 = recurring cost / 権限クラス = role (`profiles.class`)

## Architecture

- Next.js 14 (App Router) / TypeScript / Mantine + Tailwind. `app/layout.tsx` sets `dynamic = "force-dynamic"` (no static caching).
- Auth: Supabase Auth + Google OAuth, restricted to the `@future-tech-association.org` domain.
- Use `@supabase/ssr` (`createServerClient` / `createBrowserClient`) only. Clients are created in `createServerSupabase()` (`app/utils/supabase/clients.ts`) and `SupabaseProvider`; middleware uses `createServerClient` with request cookies. **`@supabase/auth-helpers-nextjs` is forbidden** (ESLint `no-restricted-imports`): its cookie format differs, so mixing it makes the session unreadable and RLS silently returns 0 rows for every query.
- **Never `await` `supabase.auth.*` (`getUser()` / `getSession()` …) inside an `onAuthStateChange` callback.** It deadlocks with auth-js `initializePromise`, the Web Lock is never released and auth hangs forever. Defer async work with `setTimeout(..., 0)` and use `session.user` directly for display (authorization is middleware / RLS).
- Provider stack (`app/layout.tsx`): `SupabaseProvider` → `QueryProvider` → `MantineProvider` → `DatesLocaleProvider` → `AuthProvider`. Date UI is `@mantine/dates` via `CustomDatePicker` / `CustomMonthPicker`; never put a date picker in the layout.

### State and data access

- Master data: Jotai `app/atoms/optionsAtom.ts`, hydrated by `InitialOptionalLoader`. Server state: TanStack Query hooks in `app/hooks/useMatterData.ts` (Server Components warm the cache via `initialData`). Forms: `@mantine/form`.
- DB helpers live in `app/utils/supabase/*`; call them from Server Components or via the query hooks. `app/actions/` holds Server Actions (currently only re-exports Slack notifications); add new Server Actions there.
- RLS is enabled: write every DB operation assuming RLS.

### Authorization (`middleware.ts`)

- Roles are `profiles.class`: `public` / `teamleader` / `accounting` / `admin`.
- `ROUTE_PERMISSIONS` in `app/utils/permissions.ts` is the single definition of role-restricted routes. `/` and `/matters` need login only; sub-routes under `/matters` are restricted. Old `/team` and `/accounting` remain as redirect pages and stay in `ROUTE_PERMISSIONS` so roles are checked before the redirect (looks duplicated — don't remove). Manual role × page checks: `docs/testing.md` 3.7.
- Authentication uses `getUser()` (server-verified token). Never use `getSession()` for auth decisions: it returns the unverified cookie value (forgeable).
- The role comes from the `user_class` claim of the same verified JWT (set by `public.custom_access_token_hook`, see `docs/database.md`), avoiding a `profiles` query. If the claim is not a valid non-empty string (missing / `null` / empty / non-string), fall back to querying `profiles` (fail-safe, works even if the hook is disabled). **Enable the hook in the production Supabase dashboard only after the migration is applied** (enabling earlier locks every user out). A new user's first token always has `user_class: null`; the fallback applies it immediately.
- When a role is already in the JWT, a role change takes effect only on token refresh (up to ~1 hour) or re-login (a null claim falls back to `profiles` and takes effect immediately). Don't rely on middleware alone where immediate effect is needed.
- Transient Supabase Auth failure (fetch failure or 5xx) → middleware returns 503, not a redirect to `/login`, so outages aren't confused with forged tokens. `isAuthRetryableFetchError` covers only 502/503/504 (500 becomes `AuthApiError`), hence `isTransientAuthError` in `app/utils/routeGuard.ts` also treats 5xx `AuthApiError` as transient.
- Timeouts (must stay under the 25 s Edge limit): one Supabase request 5 s (`AUTH_FETCH_TIMEOUT_MS`), whole `getUser()` 6 s (`AUTH_GET_USER_TIMEOUT_MS`), `profiles` fetch inner 5 s / outer 6 s (`AUTH_PROFILES_TIMEOUT_MS`); all fall to 503 with `Retry-After: 2`. The outer must be larger than the inner (same delay fires the outer first). The inner `profiles` abort comes back as `{ error }` (postgrest-js wraps it; detect via `isProfilesTimeoutError` → 503), the outer cuts a stalled body → 503; any other `profiles` fetch failure redirects to `/`. Details live in `app/utils/routeGuard.ts` and `middleware.ts` (`serviceUnavailable`).

## Business logic

- Matter lifecycle: draft → accounting requested → accounting confirmed → done.
- Amounts: `business` (revenue) and `costs` (expenses) are linked per matter.
- Team leaders can view all matters of their team.
- A matter edited after its accounting request is highlighted on the accounting side (sent back).
- Matter owners are notified via Slack.

## Key files

- `middleware.ts` — route protection and role check (logic in `app/utils/routeGuard.ts`; `matchesRoute` in `permissions.ts`)
- `app/components/providers/` — `SupabaseProvider`, `QueryProvider`, `DatesLocaleProvider`, `InitialOptionalLoader`
- `app/utils/matterCalc.ts` / `matterValidation.ts` — matter totals and required / date validation
- `app/utils/profitLossLogic.ts` / `profitLossClosing.ts` / `profitLossDiff.ts` — pure functions for P&L aggregation, monthly closing, post-closing change detection. Fetching is `app/utils/supabase/profitLossSource.ts` (never expose as a Server Action)
- `app/utils/supabase/editMatterInfo.ts` — matter CRUD core; `profiles.ts` / `matters.ts` / `costs.ts` / `businesses.ts` / `selectOptions.ts` — per-domain DB helpers
- `app/actions/slack/` — Slack notification Server Actions
- Docs (Japanese): `docs/setup.md` / `specification.md` / `database.md` / `testing.md`
