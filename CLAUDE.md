# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Gyro Republic Weekly Business Review dashboard: Next.js (App Router) + TypeScript, with an admin panel inside the dashboard.
No database: JSON files behind a `Storage` interface (local `./.data`, or a private GitHub repo via env vars). See README.md and PLAN.md.

## Commands

- Dev: `npm run dev` (needs `.env.local`, see `.env.local.example`)
- Tests: `npm test` (vitest, `vmThreads` pool; the default pools fail to register suites on this machine)
- Types: `npm run typecheck`; ported dashboard modules: `npm run check:dashboard`
- Browser checks (dev server running, sample loaded with `npm run sample -- --map`): `npm run e2e:parity`, `npm run e2e:access`

## Structure

- `src/dashboard/*.ts`: verbatim port of `reference/index.html`'s script, one module per tab. DOM-string rendering, `// @ts-nocheck`. They read `window.__BOOT__`; do not embed data in them. Change behaviour here only if the reference changes; `npm run e2e:parity` must stay green.
- `src/lib/data/boot.ts`: builds `__BOOT__` per person and week, on the server. All access filtering happens here.
- `src/lib/data/revenue.ts`: applies the admin's dining-option mapping to raw Toast rows. Unmapped options go to the "Unmapped" line and still count in totals.
- `src/lib/workbook/parse.ts`: reads the weekly workbook (runs in the browser and in tests).
- `src/lib/storage`, `src/lib/auth`: storage adapters, scrypt passwords, signed session cookie, access rules.
- `src/components/admin/*`: the five admin screens (Weeks & data, Mapping, Locations, People & access, Formatting).

## Conventions

- Feature branch and PR to `main`; small commits with imperative messages.
- Never hard-code secrets. `.env.local`, `.data/` and `reference/` are git-ignored (business data).
- House style in the UI: no em dashes (use "-"), negative variances in brackets like (11.2%), first table column left aligned and the rest centered, toggles on the right, light mode only.
- Every mutating API call needs the `X-Requested-With: gwbr` header and an admin session (`requireAdmin`).
- The old dining-option mapping from `index.html` is NOT a default; it only exists as a test fixture (`tests/helpers/fixtureMapping.ts`).
- Ask before adding dependencies or restructuring.
