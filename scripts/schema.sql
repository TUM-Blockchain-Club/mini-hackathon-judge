CREATE TABLE IF NOT EXISTS event_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), deadline timestamptz,
  rubric jsonb, started_at timestamptz, model text, snapshot text
);
INSERT INTO event_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, code_hash text UNIQUE NOT NULL,
  pitch smallint CHECK(pitch BETWEEN 0 AND 50)
);
CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES teams,
  title text NOT NULL, focus text NOT NULL, source text NOT NULL, filename text NOT NULL,
  content bytea NOT NULL, digest text NOT NULL, submitted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS submission_latest ON submissions(team_id, submitted_at DESC);
CREATE TABLE IF NOT EXISTS judge_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL UNIQUE REFERENCES submissions,
  worker text, phase text NOT NULL DEFAULT 'queued', until_at timestamptz NOT NULL,
  rubric jsonb NOT NULL, model text NOT NULL, snapshot text NOT NULL, scorecard jsonb,
  points smallint CHECK(points BETWEEN 0 AND 50), issue text
);
CREATE TABLE IF NOT EXISTS observations (
  run_id uuid NOT NULL REFERENCES judge_runs, ref text NOT NULL, command text NOT NULL,
  output text NOT NULL, PRIMARY KEY(run_id, ref)
);
CREATE TABLE IF NOT EXISTS login_attempts (
  bucket text PRIMARY KEY, starts timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 1
);

-- An absent profile identifies a team created by the older invite-code desk.
CREATE TABLE IF NOT EXISTS team_profiles (
  team_id uuid PRIMARY KEY REFERENCES teams(id),
  members jsonb NOT NULL CHECK (jsonb_typeof(members)='array' AND jsonb_array_length(members) BETWEEN 1 AND 3),
  password_hash text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE TABLE IF NOT EXISTS team_sessions (
  token_hash text PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES team_profiles(team_id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS team_sessions_expiry ON team_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  password_hash text NOT NULL, seat smallint UNIQUE CHECK (seat BETWEEN 1 AND 3)
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_name_unique ON admin_accounts(lower(name));
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash text PRIMARY KEY, admin_id uuid NOT NULL REFERENCES admin_accounts,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS pitch_ballots (
  team_id uuid NOT NULL REFERENCES teams, admin_id uuid NOT NULL REFERENCES admin_accounts,
  p1 smallint NOT NULL CHECK (p1 BETWEEN 0 AND 15), p2 smallint NOT NULL CHECK (p2 BETWEEN 0 AND 15),
  p3 smallint NOT NULL CHECK (p3 BETWEEN 0 AND 10), p4 smallint NOT NULL CHECK (p4 BETWEEN 0 AND 10),
  PRIMARY KEY(team_id,admin_id)
);
ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS guide text;
ALTER TABLE judge_runs ALTER COLUMN points TYPE double precision;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS late boolean NOT NULL DEFAULT false;
ALTER TABLE judge_runs ADD COLUMN IF NOT EXISTS jury_review jsonb;
-- Existing cutoffs, frozen batches and legacy pitch totals are preserved.
UPDATE event_settings SET deadline='2026-11-28 17:00:00+01' WHERE deadline IS NULL AND started_at IS NULL;
CREATE TABLE IF NOT EXISTS podium_decisions (
  signature text PRIMARY KEY, team_order jsonb NOT NULL, reason text NOT NULL
);
CREATE TABLE IF NOT EXISTS jury_decisions (
  id bigserial PRIMARY KEY, run_id uuid NOT NULL REFERENCES judge_runs,
  decision jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
