-- Authentication is intentionally excluded from this first milestone.
-- owner_id is retained for a future users table and may be NULL for now.

CREATE TABLE IF NOT EXISTS pgs (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6),
  owner_id BIGINT,
  contact_name VARCHAR(120),
  contact_phone VARCHAR(30),
  base_rent NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (base_rent >= 0),
  food_charge NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (food_charge >= 0),
  electricity_charge NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (electricity_charge >= 0),
  maintenance_charge NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (maintenance_charge >= 0),
  security_deposit NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (security_deposit >= 0),
  amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pgs_city_idx ON pgs (city);
CREATE INDEX IF NOT EXISTS pgs_coordinates_idx ON pgs (latitude, longitude);

CREATE TABLE IF NOT EXISTS rooms (
  id BIGSERIAL PRIMARY KEY,
  pg_id BIGINT NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  room_number VARCHAR(50) NOT NULL,
  capacity SMALLINT NOT NULL CHECK (capacity > 0),
  occupied_beds SMALLINT NOT NULL DEFAULT 0 CHECK (occupied_beds >= 0 AND occupied_beds <= capacity),
  rent_override NUMERIC(10, 2) CHECK (rent_override >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pg_id, room_number)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pgs_set_updated_at ON pgs;
CREATE TRIGGER pgs_set_updated_at
BEFORE UPDATE ON pgs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
