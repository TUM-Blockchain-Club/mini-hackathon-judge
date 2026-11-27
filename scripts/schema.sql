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
