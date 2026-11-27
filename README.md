# TBC Mini Hackathon Judge

A Next.js submission desk and organizer dashboard for the LIGHT UP × TUM Blockchain Club hackathon. Every team submits to one of nine track focuses. The AI submission score contributes 50 points and the jury pitch contributes 50. The organizer sees a single cross-track ranking once both scores exist.

## Run locally

Use Node 22.13 or newer and PostgreSQL 15 or newer. Create a dedicated empty database. Copy `.env.example` to `.env.local`, enter the database URL and set a random organizer password of at least 24 characters. The web interface and submissions work with these two settings. Local tests use simulated model and sandbox services.

```sh
npm ci
npm run db:setup
npm run dev
```

Open `http://localhost:3000`. Sign in at `/organizer`, set the event deadline, review the rubric, and create a code for each team. Save each code when it is issued. The participant page displays the deadline in Berlin time. The organizer edits it in their browser’s time zone. The public brief is maintained in [Andi’s repository](https://github.com/andi-lightup/lightup-tbc-hackathon).

## Run an event

1. Enter Andi’s requirements under **Deadline and evaluation rubric**. The bundled rubric is a rehearsal fixture. Each criterion needs an ID, a title, maximum points and guidance for partial credit. Each focus plus the common criteria must total 50. Set a distinct rubric version for the official batch.
2. Give each team its private access code. Teams can enter a public GitHub commit URL with a full SHA or upload one file. Private repos and multifile submissions can use a ZIP. File uploads accept 3 MiB, downloaded GitHub archives accept 24 MiB, and archives are limited to 2,500 entries and 96 MiB unpacked. The platform rejects encrypted archives, symlinks and unsafe paths. Direct document formats include PDF, DOCX and XLSX. Teams receive a timestamped receipt and SHA-256 digest. Use another submission with the same team code for a revision.
3. After the deadline, click **Start judging**. A database transaction selects the latest accepted revision from each team and freezes its source, criteria, model and sandbox snapshot. One workflow per submission claims a distinct run. The batch shares a 15-minute wall-clock deadline including queueing. **Resume dispatch** recovers unclaimed jobs without replacing a judge already at work.
4. Inspect the standings, evidence and per-requirement scorecards in the organizer desk. Each scored row cites the saved command, its output and a location in the source. A provider failure or timeout puts the submission into review with its evidence and no numerical award. Organizers can download the original submission for an independent jury review. Enter each team’s pitch points to calculate its overall percentage. Tied teams retain equal scores.

The judge inspects the original and uses a writable copy for offline reproduction. It can read documents, extract spreadsheet cells, use OCR on images and run available tools. It receives the same bounded inspection and verification passes for every team. Cross-checking opens at minute ten, followed by structured scoring. A small submission can exhaust its inspection passes earlier and wait for this checkpoint. No account logins, network installs or team secrets are available in the judging session. Include offline fixtures and vendored dependencies when reproduction needs them.

## Configure Vercel when ready

1. Import this repository as a Next.js project. Use a supported Node runtime, a pooled Postgres connection and an organizer password in the deployment environment. Run `npm run db:setup` against that database once. Schema setup is idempotent.
2. Enable Vercel Workflow and Sandbox access for the project, enable AI Gateway billing/access, and choose a versioned, tool-capable model with structured outputs. Set `JUDGE_MODEL` to that exact gateway identifier. On Vercel the SDKs use project OIDC. For an authenticated local rehearsal, link the project and pull the development environment with the Vercel CLI. A dedicated `AI_GATEWAY_API_KEY` is also supported for model calls.
3. From the linked project with sandbox credentials, run `npm run sandbox:prepare`. This builds the Ubuntu snapshot with Node, Python, office-file readers, PDF utilities and OCR. Set `JUDGE_SNAPSHOT_ID` to the printed ID in the deployment environment. Keep the same snapshot for the batch.
4. Rehearse with a separate event database and the expected number of teams. Compare a strong, partial and incomplete submission with Andi’s hand-scored examples. Measure click-to-last-scorecard time and check model rate limits, sandbox concurrency and the model’s context capacity. The AI score is provisional until the organizer has reviewed the evidence. [Sandbox quotas](https://vercel.com/docs/sandbox/pricing) · [Vercel Workflows](https://vercel.com/docs/workflows)

## Verify the build

```sh
npm run typecheck
npm test
npm run build
```

For the integration checks, export `TEST_DATABASE_URL` pointing at a dedicated rehearsal database where the user can create schemas. Each test creates and removes its own schema. The browser check uses a production build. Install Playwright Chromium with `npx playwright install chromium`, or use `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome` for a local Chrome installation.

```sh
npm test
npm run test:rehearsal
npm run test:browser
```

The rehearsal runs eleven concurrent workflows with the production scoring and persistence code, a virtual clock and test doubles for the cloud services. A live Vercel run is needed to measure provider latency and judge quality.
