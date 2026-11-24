# PLAN: Gyro Republic WBR dashboard (Next.js + admin panel)

Source of truth for numbers, calculations, layout and style: `reference/index.html`.
Weekly input workbook: `reference/Gyro_Republic-WBR_Input_2.xlsx`.
Both are git-ignored (business data); tests skip the parity checks if they are missing.

## What the reference already gives us

`index.html` was written to be fed by a backend: it reads `window.__BOOT__`
(`user`, `tabs`, `locations`, `channels`, `locData`, `integrations`, `sections`, `week`, `asOf`, `formats`).
The server therefore only has to build that object, per person and per week, and the rendering code
runs unchanged. That is how "numbers and look identical" is guaranteed: the rendering functions are
ported verbatim, one module per tab, and the parity test compares the data they are fed.

## Decisions (from the brief + answers already given)

- **No database.** Everything is JSON behind a `Storage` interface (`get/put/delete/list`).
  Default adapter: files in `./.data` (git-ignored). GitHub adapter (private data repo) switches on when
  `GITHUB_TOKEN`, `GITHUB_DATA_REPO`, `GITHUB_DATA_BRANCH` are all set. Nothing needs the token today.
- **Mapping starts empty.** The existing mapping in `index.html` is NOT imported. Every dining option found
  in an upload is offered to the admin for mapping. Unmapped sales still count in every total and show on an
  "Unmapped" line. (The old mapping is used only as a fixture inside the parity test.)
- **Auth:** people in `people.json` (scrypt salted hashes, never plain text). First admin from
  `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Session = HMAC-signed HttpOnly cookie (`SESSION_SECRET`).
- **Access is enforced on the server** when `BOOT` is built: Admin = all + Admin tab; Client = all locations,
  no Admin tab; Location = assigned locations only, Marketing + Catering hidden and their data not sent.
- **3rd Party Delivery and Catering** keep the data embedded in `index.html` (extracted once into a seed file and
  stored with the first week). New weeks that do not include them show the latest earlier copy with the
  existing "Showing data from the week of ..." note (`BOOT.asOf`).
- **Budget** has no source yet (as in the reference): dashes. **Var vs LW** is filled from the previous stored
  week when one exists (the reference left it blank because it only had one week).

## Data model (all JSON)

```
config/locations.json   [{ name, hidden, platforms[], aliases[] }]     (Yelp only at Fondren + Richmond; Spring alias "Klein")
config/mapping.json     { categories:[{ name, color, lines:[{ name, options[] }] }] }
config/people.json      [{ id, email, name, role, locations[], salt, hash }]
config/formats.json     [{ table, column, axis, mode, rules[] }]
weeks/index.json        [{ weekStart, uploadedAt, file, sections[] }]
weeks/<weekStart>.json  { weekStart, toast:{period:{kind:{location:[[option,category|null,net]]}}},
                          reviews, loyalty, marketing, tpd?, catering? }
```

Toast rows are stored raw (dining option, sales category, net sales), so changing the mapping re-applies to every
week without re-uploading.

## Modules

1. `src/lib/storage` - interface, local-file adapter, GitHub adapter, factory.
2. `src/lib/auth` - scrypt hashing, signed cookie session, people store, access rules.
3. `src/lib/workbook` - pure parser (browser + node): Toast tabs, SO 7 & 90, SO 30, AppFront x2, Apollo.
4. `src/lib/data` - weeks, config, mapping engine, `buildBoot()` (the access-filtered `__BOOT__`).
5. `src/dashboard/*` - verbatim port of the reference script, one file per tab
   (overview, revenue, reviews, tpd, loyalty, marketing, catering, location) + core helpers + colour formats.
6. `src/app` - login, dashboard page, API routes (`/api/login`, `/api/logout`, `/api/boot`, `/api/admin/*`).
7. `src/components/admin/*` - Weeks & data, Mapping, Locations, People & access, Formatting.

## Build order (tested after each step)

1. Storage + auth (unit tests: local adapter, hashing, session tamper, access filter).
2. Workbook parser + data pipeline (tests against the sample workbook).
3. Dashboard tabs ported + `buildBoot` (parity test vs `reference/index.html`).
4. Admin screens (upload review with unmapped-option prompt, mapping, locations, people, formatting).
5. Colour formatting engine wired to the formats screen.

## Risks

- **Parity of Toast mapping:** the reference merges spelling variants ("Doordash Delivery", "DoorDash -  Delivery").
  The parity test carries an explicit fixture mapping; in the product the admin does the merging.
- **No PTD tabs in the sample workbook** (the reference has PTD data from an earlier file). The parser reads PTD
  tabs when present; the parity test cannot verify PTD against this workbook and says so.
- **GitHub adapter** cannot be exercised end to end without a token; it is unit-tested against a fake `fetch`.
- **`xlsx` (SheetJS) from npm** is an old release; it only runs on files an authenticated admin uploads.
- **Serverless hosting** would lose `./.data`; the GitHub adapter is the answer there.
- The repo may be public: nothing in `.data`, `reference/` or `.env*` is committed.

## Status (all steps built and tested)

1. Storage + auth: 10 unit tests (local + fake-GitHub adapters, hashing, cookie tamper/expiry, last-admin and self-removal rules).
2. Workbook parser + pipeline: reviews, loyalty and Apollo equal the reference exactly; every Toast total, channel line and sales category equals the reference for 4 periods x 2 series x 8 sheets (PTD tabs are not in the sample workbook).
3. Dashboard tabs ported; `npm run e2e:parity` compares 64 tab/toggle states (text and chart data) against `reference/index.html` in headless Chrome: all match. A negative control (mapping cleared) produces 28 differences, so the check does bite.
4. Admin screens built; upload asks for unknown locations and unmapped dining options before publishing.
5. Colour rules applied by the dashboard (checked in the browser).

Known limits: `src/dashboard/*` keep `// @ts-nocheck` (verbatim port); budget has no source (dashes, as in the reference); the fiscal calendar is hard-coded for FY2025-26; the GitHub adapter is only tested against a fake API.
