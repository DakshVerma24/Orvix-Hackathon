CREATE TABLE IF NOT EXISTS applications (
  id BIGSERIAL PRIMARY KEY,
  pg_id BIGINT NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  applicant_name VARCHAR(120) NOT NULL,
  applicant_phone VARCHAR(30),
  applicant_email VARCHAR(255),
  preferred_room_id BIGINT REFERENCES rooms(id) ON DELETE SET NULL,
  move_in_date DATE,
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS applications_pg_status_idx ON applications (pg_id, status);

DROP TRIGGER IF EXISTS applications_set_updated_at ON applications;
CREATE TRIGGER applications_set_updated_at
BEFORE UPDATE ON applications
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS invites (
  id BIGSERIAL PRIMARY KEY,
  pg_id BIGINT NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  recipient_name VARCHAR(120) NOT NULL,
  recipient_phone VARCHAR(30),
  recipient_email VARCHAR(255),
  sent_by_name VARCHAR(120) NOT NULL,
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invites_pg_status_idx ON invites (pg_id, status);

DROP TRIGGER IF EXISTS invites_set_updated_at ON invites;
CREATE TRIGGER invites_set_updated_at
BEFORE UPDATE ON invites
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
