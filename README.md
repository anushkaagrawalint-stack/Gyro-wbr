# Gyro Republic Weekly Business Review

Next.js (App Router, TypeScript) dashboard with a built-in admin panel. No database: everything is JSON files.

## Run it

```bash
npm install
cp .env.local.example .env.local     # then fill in SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev                          # http://localhost:3000
```

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (this first admin is created automatically when no people exist yet).
Open the **Admin** tab, then **Weeks & data**, and upload the weekly workbook.

A fresh install has **no dining-option mapping**. The first upload asks where every Toast dining option goes
(or lets you leave it on the "Unmapped" line, which still counts in every total). Manage it later under **Admin > Mapping**.

## Where data lives

| | |
|---|---|
| Default | JSON files in `./.data` (git-ignored) |
| GitHub | set `GITHUB_TOKEN`, `GITHUB_DATA_REPO` (`owner/name`, a private repo) and `GITHUB_DATA_BRANCH`; every save becomes a commit. Token needs "Contents: read and write" on that repo only. |

Nothing needs the token until you turn the GitHub adapter on. People are stored with salted scrypt hashes, never plain text.

## Access levels (enforced on the server before data is sent)

- **Admin**: everything, plus the Admin tab.
- **Client**: all locations, no Admin tab.
- **Location**: only the assigned locations; Marketing and Catering tabs hidden and their data not sent; "All Locations" means their locations.

## Checks

```bash
npm test                 # unit + parity tests (parity tests need reference/ files, otherwise they skip)
npm run typecheck
npm run check:dashboard  # the ported dashboard modules: undefined names / broken imports
# with `npm run dev` running and the sample loaded (npm run sample -- --map):
npm run e2e:parity       # every tab and toggle in headless Chrome vs reference/index.html
npm run e2e:access       # sign-in, access levels, colour rules, house style
```

## Notes

- `reference/` (the original `index.html` and the sample workbook) is git-ignored because it holds business data.
- 3rd Party Delivery and Catering still use the data embedded in `reference/index.html`; `npm run seed` copies it into the data store.
- The fiscal calendar (period and week numbers) is hard-coded in `src/dashboard/core.ts` for FY2025 and FY2026, as in the reference. Add FY2027 there before that year starts.
