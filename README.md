# Leavebird

## Postgres login branch

This branch runs as a standard Next.js application on a Node.js host. It adds email/password accounts, HTTP-only database sessions, and per-user timesheet storage in Postgres.

1. Copy `.env.example` to `.env` and set a strong Postgres password in the shell as `POSTGRES_PASSWORD`.
2. Start Postgres with `docker compose up -d postgres`.
3. Install packages with `npm install`.
4. Run `npm run db:migrate`, then `npm run dev`.

In production, serve the app over HTTPS so the secure session cookie is protected in transit. Existing `clocked-off-timesheet-v1` browser records are imported automatically when an account has no server-side data yet.

For the included container deployment, set `POSTGRES_PASSWORD` and `SITE_HOST` in `.env`, then run `docker compose up -d --build`. Postgres is kept on the private Docker network; Caddy publishes ports 80 and 443 and manages HTTPS automatically.

## Google sign-in

OAuth sign-in is optional: email and password continue to work when provider
credentials are absent. Copy the OAuth values from `.env.example` into the
deployment environment and generate `OAUTH_STATE_SECRET` from at least 32
random bytes. Never expose these values to browser code or commit them.

Production callback: `https://leavebird.com/api/auth/oauth/google/callback`

For Google, create a Web application OAuth client and set
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Add the production callback
as an authorised redirect URI. A localhost callback may be added separately for
development.


OAuth identities are stored separately from users. When a provider supplies the
same verified email as an existing Leavebird account, the identity is linked to
that user so their existing timesheets remain attached.

## Owner health dashboard

`/admin` is a private operational dashboard. It is deliberately absent from normal navigation and every page/API request is authorised server-side against one immutable account ID.

### Configure the owner

1. Look up the UUID for the existing `morgan@ablench.com` account from the `users` table on the server.
2. Set that UUID as `ADMIN_USER_ID` in the deployment environment. Never commit the UUID or use an email address as the runtime access check.
3. Rebuild/restart the app. A missing, malformed or non-matching value denies everybody.

The page and `/api/admin/metrics` return a generic not-found response to signed-out and ordinary users. Admin responses are marked private/no-store and no-index.

### What is collected

The app keeps privacy-preserving operational data for 90 days:

- route group, response status and duration;
- daily authenticated activity keyed by internal user ID for aggregate DAU/WAU/MAU counts;
- successful/failed authentication, admin-access and bank-holiday outcomes.

It does not collect raw URLs, query values, IP addresses, passwords, tokens, timesheet notes, leave descriptions or Daily Chirp viewing history. Metrics writes are best-effort: failures are swallowed so they cannot prevent login or timesheet saving. Cleanup runs opportunistically at most once per day.

### Backup status

Set `LAST_BACKUP_AT` to the latest successful backup time in ISO-8601 format and refresh it from the backup job. `BACKUP_MAX_AGE_HOURS` defaults to 36. If no timestamp is supplied, the dashboard prominently reports that backup monitoring is unknown rather than implying a backup exists.

### Metric definitions

- **Entry:** a calendar day with recorded working hours or start/finish values.
- **Recorded week:** a Monday-to-Sunday week containing at least one entry.
- **Submitted week:** a week explicitly marked ready for employer submission.
- **Active user:** an account with an authenticated visit or data update in the selected period.

Averages and medians for recorded weeks are labelled as excluding users who have never recorded a week.

### Operations and recovery

The dashboard reports application/PostgreSQL/public-endpoint health, pool usage, query failures, request latency/error rates, storage size, the latest migration and bank-holiday availability.

If the dashboard is unavailable while Leavebird is otherwise healthy:

1. Confirm `ADMIN_USER_ID` contains the owner account UUID, not an email.
2. Confirm migration `003_admin_metrics.sql` appears in `schema_migrations`.
3. Check that PostgreSQL can read the three metrics tables.
4. Remove or correct an invalid backup timestamp rather than fabricating freshness.
5. Core timesheet use can continue while metrics are repaired; do not weaken the admin check as a workaround.

To revoke admin access immediately, remove `ADMIN_USER_ID` and restart the app. To recover access after an account replacement, verify the intended owner out of band and pin the new immutable UUID.

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
