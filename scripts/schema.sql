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
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS own_topic text;
CREATE TABLE IF NOT EXISTS judge_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL UNIQUE REFERENCES submissions,
  worker text, phase text NOT NULL DEFAULT 'queued', until_at timestamptz NOT NULL,
  rubric jsonb NOT NULL, model text NOT NULL, snapshot text NOT NULL, scorecard jsonb,
  points smallint CHECK(points BETWEEN 0 AND 50), issue text
);
-- A changed cutoff revision is stored separately from the original receipt.
ALTER TABLE judge_runs ADD COLUMN IF NOT EXISTS archive_source text;
ALTER TABLE judge_runs ADD COLUMN IF NOT EXISTS archive_digest text;
ALTER TABLE judge_runs ADD COLUMN IF NOT EXISTS archive_content bytea;
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
-- Block grace-period writes from earlier deployments while retaining existing receipts.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='submissions'::regclass AND conname='submissions_on_time') THEN
    ALTER TABLE submissions ADD CONSTRAINT submissions_on_time CHECK (NOT late) NOT VALID;
  END IF;
END $$;
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

CREATE TABLE IF NOT EXISTS organizer_sessions (
  token_hash text PRIMARY KEY, expires_at timestamptz NOT NULL
);

-- NULL settlement holds the maximum charge if the API outcome is unknown.
CREATE TABLE IF NOT EXISTS judge_token_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid,
  ceiling_micros integer NOT NULL CHECK (ceiling_micros > 0),
  settled_micros integer CHECK (settled_micros BETWEEN 0 AND ceiling_micros),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS judge_schema_migrations (
  digest text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);

-- These tables are private to the server connection, which owns them. Browser
-- sessions use the application's authenticated routes, including for the directory.
DO $$
DECLARE
  table_name text;
  api_role text;
  event_schema text := current_schema();
  tables text[] := ARRAY['event_settings','teams','submissions','judge_runs',
    'observations','login_attempts','team_profiles','team_sessions','admin_accounts',
    'admin_sessions','organizer_sessions','pitch_ballots','podium_decisions','jury_decisions','judge_schema_migrations','judge_token_charges'];
  decision_sequence regclass := pg_get_serial_sequence('jury_decisions','id')::regclass;
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',event_schema,table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC',event_schema,table_name);
    FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',event_schema,table_name,api_role);
    END LOOP;
  END LOOP;
  IF decision_sequence IS NOT NULL THEN
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC',decision_sequence);
    FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM %I',decision_sequence,api_role);
    END LOOP;
  END IF;
END $$;
