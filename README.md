# TBC Mini Hackathon Judge

A participant submission page and organizer dashboard for the LIGHT UP × TUM Blockchain Club hackathon. Teams choose a suggested focus or an original topic in one of three tracks. The AI submission score contributes 50 points and the jury pitch contributes 50. The organizer sees a single cross-track ranking once both scores exist.

## Run locally

Use Node 22.13 or newer and PostgreSQL 15 or newer. Create a dedicated empty database. Copy `.env.example` to `.env.local`, enter the database URL and set a random organizer password of at least 24 characters. Use the same table-owning database role for schema setup and for the server. The web interface and submissions work with these two settings. Local tests use simulated model and sandbox services.

```sh
npm ci
npm run db:setup
npm run dev
```

Share `/signup` with new teams and `/login` with returning teammates. Both links open the relevant form on `/submit`. Teams can register two or three members, enter their project and receive a submission receipt on this page. Only admins can create a solo team or change a registered roster. Every member can sign in on their own device with the same team name and password. New team names use letters A–Z, digits and underscores. Existing names also work at login. Signed-in teams can open **Other teams** to see each other team’s name and its members’ first and last names. Projects and revisions require an active team login. The submission and team administration pages are prerendered. Same-origin APIs load the deadline and private session data from PostgreSQL. Vercel production builds apply schema changes transactionally before promotion. Local installations can apply the same schema with `npm run db:setup`. Setup enables row-level security on the event tables and revokes direct access from Supabase’s client roles. Organizers with a session from before server-side organizer logout was introduced must sign in again.

In the **Resources** navbar tab (`/resources`), teams can download the participant materials ZIP with the event brief, tracks, rating matrices, sample data, hands-on test log, submission template and pitch scoring criteria. Switching between Submission and Resources keeps the current form entries. Teams can include their pitch deck in the public repository. The [student AI tools setup guide](public/docs/student-ai-tools.pdf) is included in this project and served as a static PDF.

Team admins use individual names and passwords at `/admin` to create, inspect or edit teams. For teams created with an old invitation, an admin can enable login by adding their roster and setting a team password. The judging desk is at `/organizer`. The participant submission deadline is displayed in Berlin time.

## Run an event

1. Sign in at `/organizer` as **Organizer** with the environment password. Under **Admins and jury seats**, create individual accounts and assign seats 1–3 to the jurors. You can create any number of team admins. Only the three seated accounts can vote. The first **Start judging** imports the approved private guide if the event has none. To use a revised guide, import the Markdown under **Deadline and evaluation rubric** before starting. The event database stores the guide. The organizer and seated jurors can read it.
2. Teams register themselves, or an admin creates their team and shares its login. After signup or login, the team board at `/board` links to the submission form, resources and the full LIGHT UP challenge brief. It shows the track paths, demo format and event cutoffs. Teams enter a project name, short description (up to 500 characters) and public GitHub repository link. The server downloads the default branch without credentials and saves its archive and exact commit in the registration receipt. When judging starts, the server selects the latest default-branch commit through 17:05:00 Berlin time (five minutes after the configured deadline), using GitHub’s committer timestamp, and freezes that archive for every judging retry. An unavailable or ineligible repository goes to jury review. Archives are limited to 24 MiB compressed, 96 MiB unpacked and 2,500 entries. Encrypted archives, symlinks and unsafe paths are rejected. Teams choosing **Own topic in this track** must enter their focus. Their latest accepted focus and receipt remain visible on the submission dashboard. Teams receive a timestamped receipt and SHA-256 digest. Submit again under the same team to submit a revision. The event deadline is 28 November 2026 at 17:00 CET. Entries received after 17:00 through 17:10 CET lose five points from the overall total, with a floor of zero. Before judging starts, changing the deadline moves both cutoffs and recalculates late penalties on existing receipts. A change that would put an accepted receipt beyond the final cutoff is rejected. The frozen judge guide includes the batch’s effective deadline and commit cutoff. PostgreSQL enforces the final cutoff when saving. The latest accepted revision determines the penalty.
3. After the ten-minute grace period, click **Start judging**. A database transaction selects the latest accepted revision from each team and freezes its source, criteria, model and Cloud Run worker image digest. Vercel dispatches one Cloud Run Job execution per submission in parallel. Each execution claims a distinct run and creates a private offline sandbox. The batch shares a 15-minute wall-clock deadline including queueing. **Resume dispatch** recovers unclaimed jobs without replacing a judge already at work.
4. The judge reports each requirement with an evidence reference, observation, label and scoring effect. Correctness, usefulness, evidence and reproducibility, and efficiency are worth 20, 10, 15 and 5. Each earns full, half or zero credit. For topics without a repeatable process the report explains the exemption and scales the first three criteria from 45 to 50. A violation earns zero for the affected part and a jury flag. Tax sandboxes receive a read-only copy of the [public dataset from Andi’s reviewed commit](https://github.com/andi-lightup/lightup-tbc-hackathon/tree/a52fec61d4d4666ed96d8936ce63bde4054e89f5/data/taxtool-sample) at `/srv/reference/taxtool-sample`.
5. Each juror signs in and saves their own pitch ballot for each team. The four maxima are 15 for demonstration, 15 for usefulness, 10 for evidence and 10 for clarity and timing. All three ballots are required for the average. The organizer records the jury’s demo observation and resulting correctness credit, or a reasoned disqualification for a serious violation. The original AI card and jury decision history remain available.
6. Standings combine the submission and pitch across all tracks and apply the late deduction once. A podium tie goes to the higher pitch average. If both scores tie, the organizer records the jury’s order and rationale. A changed tie requires a new decision. An interrupted evaluation stays in review with its evidence.

The judge inspects the original and uses a writable copy for offline reproduction. It can read documents, extract spreadsheet cells, use OCR on images and run available tools. It receives the same bounded inspection and verification passes for every team. Cross-checking opens at minute ten, followed by structured scoring. A small submission can exhaust its inspection passes earlier and wait for this checkpoint. No account logins, network installs or team secrets are available in the judging session. Include offline fixtures and vendored dependencies when reproduction needs them.

## Production infrastructure

The organizer button launches `repo-judge-v1` in `europe-west1` in the Google project `tbc-mini-hackathon-judge`. The Vercel production project uses workload identity federation through the `vercel/production` provider. Its production subject has job-level execution and read access plus read permission on the single approved guide object. The organizer start action verifies the guide digest before importing it. Google API keys, service account keys and a running laptop are unnecessary.

The Cloud Run task downloads its frozen submission in 1 MiB chunks and verifies the frozen judging archive digest. Its sandbox has a separate guest filesystem, a read-only input mount and blocked network access. The trusted worker sends evidence to Vercel using an expiring ticket scoped to its run. The Vercel server calls the OpenAI Responses API directly and validates the scorecard before writing points to PostgreSQL. Use `DATABASE_URL` and `ORGANIZER_PASSWORD` in Vercel production. Keep the Vercel Production variable named `GEMINI_API_KEY` and set its value to a server-only [OpenAI project API key](https://platform.openai.com/api-keys), then redeploy. All submissions use `gpt-6-luna` on the standard service tier. The project that issued the key pays for those calls. PostgreSQL enforces a shared $33 token budget for this event, including checks and retries. Before each request it reserves the maximum possible cost, then reduces the reservation using reported token counts and conservative [OpenAI rate ceilings](https://developers.openai.com/api/docs/pricing). Missing usage leaves the reservation in place. If the remaining balance cannot cover another call, the affected run goes to jury review. Cloud Run and unrelated usage of the key are billed separately. The organizer’s start button checks model access before freezing submissions.

The worker's Cloud Build recipe and digest-pinned Cloud Run manifest are under `cloud/worker`. Submit builds with `gcloud builds submit --ignore-file=cloud/worker/gcloudignore --config=cloud/worker/build.yaml`, specifying the build service account, region, project and `_IMAGE` substitution. Set the resulting digest in the manifest and deploy with `gcloud run jobs replace cloud/worker/job.yaml --project=tbc-mini-hackathon-judge --region=europe-west1`. Rehearse image changes before a batch and use the same digest for every team. A project operator can POST a Google ID token for the build service account, with the production probe URL as audience, to `/api/judge/probe` to launch a synthetic sandbox and check direct OpenAI access without creating event submissions. The Cloud Run execution log records the outcome.

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
