CREATE TABLE IF NOT EXISTS roommate_profiles (
  id BIGSERIAL PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  pg_id BIGINT REFERENCES pgs(id) ON DELETE SET NULL,
  bio TEXT,
  preferences JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS roommate_profiles_pg_idx ON roommate_profiles (pg_id);

DROP TRIGGER IF EXISTS roommate_profiles_set_updated_at ON roommate_profiles;
CREATE TRIGGER roommate_profiles_set_updated_at
BEFORE UPDATE ON roommate_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
