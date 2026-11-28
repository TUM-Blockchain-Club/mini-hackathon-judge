# Mini Hackathon Judge

Keep the participant flow on the statically rendered `/submit` page, including login, signup and receipts. Team administration lives at `/admin`. Load private rosters through authenticated APIs and validate the one-to-three-member limit on the server. Existing code-only teams gain a profile when an admin supplies their roster and password.

The submission form accepts a public GitHub repository link and records an intake snapshot. When judging starts, freeze the latest eligible default-branch commit as of the event commit cutoff. The organizer desk owns team access, the cutoff, the judging batch and pitch scores. Keep participant responses scoped to their team. Derive deadlines and scores on the server.

Read `judge/AGENTS.md` before changing rubric selection, the workflow, sandbox tools or scoring. Read `README.md` for the environment and event rehearsal. Keep local tests isolated from production services. For changes to submission locking or judging, exercise the PostgreSQL integration tests and run a production build.
