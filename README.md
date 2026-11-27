# TBC Mini Hackathon Judge

A participant submission page and organizer dashboard for the LIGHT UP × TUM Blockchain Club hackathon. Teams choose a suggested focus or an original topic in one of three tracks. The AI submission score contributes 50 points and the jury pitch contributes 50. The organizer sees a single cross-track ranking once both scores exist.

## Run locally

Use Node 22.13 or newer and PostgreSQL 15 or newer. Create a dedicated empty database. Copy `.env.example` to `.env.local`, enter the database URL and set a random organizer password of at least 24 characters. The web interface and submissions work with these two settings. Local tests use simulated model and sandbox services.

```sh
npm ci
npm run db:setup
npm run dev
```

Open `/submit` for the participant flow. Teams sign in or register one to three members inline, enter their project, submit and receive a receipt on this page. Every member can sign in on their own device with the same team name and password. New team names use letters A–Z, digits and underscores. Existing names also work at login. Signed-in teams can open **Other teams** to see team names and roster sizes. Invite-only teams can use **Use access code**. The submission and team administration pages are prerendered. Same-origin APIs load the deadline and private session data from PostgreSQL. Run `npm run db:setup` on existing installations to add profiles and sessions.

In the **Resources** navbar tab (`/resources`), teams can open the track briefs, rating matrices, hands-on test log, submission template and pitch scoring criteria in [Andi’s hackathon repository](https://github.com/andi-lightup/lightup-tbc-hackathon). Switching between Submission and Resources keeps the current form entries and file selection. Teams can include their pitch deck in the project commit or ZIP. The [student AI tools setup guide](public/docs/student-ai-tools.pdf) is included in this project and served as a static PDF.

Team admins use individual names and passwords at `/admin` to create, inspect or edit teams. Teams created with an old invitation retain their submission access codes. An admin can add their roster and set a team password. The judging desk is at `/organizer`. The participant submission deadline is displayed in Berlin time.

## Run an event

1. Sign in at `/organizer` as **Organizer** with the environment password. Under **Admins and jury seats**, create individual accounts and assign seats 1–3 to the jurors. You can create any number of team admins. Only the three seated accounts can vote. Under **Deadline and evaluation rubric**, import Andi’s confidential judging guide (.md). The event database stores the guide. The organizer and seated jurors can read it.
2. Teams register themselves, or an admin creates their team and shares its login. The submission form stays on screen during login. Teams can enter a public GitHub commit URL with a full SHA or upload one file. Private repos and multifile submissions can use a ZIP. File uploads accept 3 MiB, downloaded GitHub archives accept 24 MiB, and archives are limited to 2,500 entries and 96 MiB unpacked. The platform rejects encrypted archives, symlinks and unsafe paths. Direct document formats include PDF, DOCX and XLSX. Teams receive a timestamped receipt and SHA-256 digest. Submit again under the same team to submit a revision. The event deadline is 28 November 2026 at 17:00 CET. Entries received after 17:00 through 17:10 CET lose five points from the overall total, with a floor of zero. PostgreSQL enforces the final cutoff when saving. The latest accepted revision determines the penalty.
3. After the ten-minute grace period, click **Start judging**. A database transaction selects the latest accepted revision from each team and freezes its source, criteria, model and sandbox snapshot. One workflow per submission claims a distinct run. The batch shares a 15-minute wall-clock deadline including queueing. **Resume dispatch** recovers unclaimed jobs without replacing a judge already at work.
4. The judge reports each requirement with an evidence reference, observation, label and scoring effect. Correctness, usefulness, evidence and reproducibility, and efficiency are worth 20, 10, 15 and 5. Each earns full, half or zero credit. For topics without a repeatable process the report explains the exemption and scales the first three criteria from 45 to 50. A violation earns zero for the affected part and a jury flag. Tax sandboxes receive a read-only copy of the [public dataset from Andi’s reviewed commit](https://github.com/andi-lightup/lightup-tbc-hackathon/tree/a52fec61d4d4666ed96d8936ce63bde4054e89f5/data/taxtool-sample) at `/srv/reference/taxtool-sample`.
5. Each juror signs in and saves their own pitch ballot for each team. The four maxima are 15 for demonstration, 15 for usefulness, 10 for evidence and 10 for clarity and timing. All three ballots are required for the average. The organizer records the jury’s demo observation and resulting correctness credit, or a reasoned disqualification for a serious violation. The original AI card and jury decision history remain available.
6. Standings combine the submission and pitch across all tracks and apply the late deduction once. A podium tie goes to the higher pitch average. If both scores tie, the organizer records the jury’s order and rationale. A changed tie requires a new decision. An interrupted evaluation stays in review with its evidence.

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

For the integration checks, export `TEST_DATABASE_URL` pointing at a dedicated rehearsal database where the user can create schemas. Each test creates and removes its own schema. Optionally set `TEST_JUDGING_GUIDE_FILE` to your private Markdown path to rehearse with the event guide. By default the tests use synthetic instructions. The browser check uses a production build. Install Playwright Chromium with `npx playwright install chromium`, or use `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome` for a local Chrome installation.

```sh
npm test
npm run test:rehearsal
npm run test:browser
```

The rehearsal runs eleven concurrent workflows with the production scoring and persistence code, a virtual clock and test doubles for the cloud services. A live Vercel run is needed to measure provider latency and judge quality.

The registration frontend follows the TBC Hackathon 2026 site’s square panels, Montserrat typography and brand palette. The club mark comes from the [club website repository](https://github.com/TUM-Blockchain-Club/hackathon-website/tree/96d4176).
