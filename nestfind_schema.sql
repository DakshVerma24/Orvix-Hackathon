-- ============================================================
-- NestFind AI — Database Schema
-- Hackathon Project 2026
-- ============================================================
-- This file creates every table needed for:
--   1. User accounts (owners, tenants, seekers)
--   2. PG/flat listings
--   3. "True Rent" cost transparency calculator
--   4. Neighborhood "Truth Layer" safety/quality metrics
--   5. 13-parameter roommate matching engine
--   6. Invites & applications
--   7. In-app direct chat
--   8. AI-audited rental agreements


-- ============================================================
-- 1. USERS
-- One table for everyone: owners, existing residents, and seekers.
-- The "role" column decides what they can do in the app.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    user_id        SERIAL PRIMARY KEY,
    name           VARCHAR(100)  NOT NULL,
    email          VARCHAR(150)  UNIQUE NOT NULL,
    phone          VARCHAR(15),
    password_hash  VARCHAR(255)  NOT NULL,   -- never store plain-text passwords
    role           VARCHAR(20)   NOT NULL CHECK (role IN ('owner', 'tenant', 'seeker')),
    created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 2. PG_LISTINGS
-- Each vacancy/bed slot posted by an owner or existing tenant.
-- latitude/longitude power the "Geo-Radius Radar" map view.
-- ============================================================
CREATE TABLE IF NOT EXISTS pg_listings (
    listing_id      SERIAL PRIMARY KEY,
    owner_id        INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title           VARCHAR(150) NOT NULL,
    address         VARCHAR(255),
    city            VARCHAR(100),
    latitude        DECIMAL(9,6),
    longitude       DECIMAL(9,6),
    total_beds      INT DEFAULT 1,
    available_beds  INT DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_listings_owner ON pg_listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_location ON pg_listings(latitude, longitude);


-- ============================================================
-- 3. COST_BREAKDOWN — "True Rent" Calculator
-- Exposes every hidden charge so listings are genuinely comparable.
-- ============================================================
CREATE TABLE IF NOT EXISTS cost_breakdown (
    cost_id       SERIAL PRIMARY KEY,
    listing_id    INT NOT NULL REFERENCES pg_listings(listing_id) ON DELETE CASCADE,
    base_rent     NUMERIC(10,2) DEFAULT 0,
    electricity   NUMERIC(10,2) DEFAULT 0,
    wifi          NUMERIC(10,2) DEFAULT 0,
    maintenance   NUMERIC(10,2) DEFAULT 0,
    food          NUMERIC(10,2) DEFAULT 0,
    laundry       NUMERIC(10,2) DEFAULT 0,
    actual_total  NUMERIC(10,2) DEFAULT 0,   -- sum of all the above; app calculates this
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cost_listing ON cost_breakdown(listing_id);


-- ============================================================
-- 4. NEIGHBORHOOD_TRUTH_LAYER
-- Crowdsourced / verified metrics so owners' descriptions
-- aren't the only source of truth about the area.
-- Scores are on a 0–10 scale unless noted otherwise.
-- ============================================================
CREATE TABLE IF NOT EXISTS neighborhood_truth_layer (
    truth_id               SERIAL PRIMARY KEY,
    listing_id             INT NOT NULL REFERENCES pg_listings(listing_id) ON DELETE CASCADE,
    noise_level            INT CHECK (noise_level BETWEEN 0 AND 10),
    safety_score           INT CHECK (safety_score BETWEEN 0 AND 10),
    water_availability     INT CHECK (water_availability BETWEEN 0 AND 10),
    power_outage_freq      VARCHAR(50),   -- e.g. 'Rare (<1 hr)', 'Frequent'
    nearby_food_score      INT CHECK (nearby_food_score BETWEEN 0 AND 10),
    grocery_distance_km    NUMERIC(4,2),
    public_transport_score INT CHECK (public_transport_score BETWEEN 0 AND 10),
    nightlife_score        INT CHECK (nightlife_score BETWEEN 0 AND 10),
    flooding_risk          VARCHAR(20),   -- 'Low' / 'Medium' / 'High'
    construction_nearby    BOOLEAN DEFAULT FALSE,
    mobile_network_score   INT CHECK (mobile_network_score BETWEEN 0 AND 10),
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_truth_listing ON neighborhood_truth_layer(listing_id);


-- ============================================================
-- 5. ROOMMATE_PREFERENCES
-- The 13 lifestyle parameters used by the matching engine.
-- One row per user.
-- ============================================================
CREATE TABLE IF NOT EXISTS roommate_preferences (
    pref_id             SERIAL PRIMARY KEY,
    user_id             INT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    sleep_time          TIME,
    wake_time           TIME,
    cleanliness         INT CHECK (cleanliness BETWEEN 1 AND 5),      -- 1=messy, 5=very tidy
    smoking             BOOLEAN DEFAULT FALSE,
    drinking            BOOLEAN DEFAULT FALSE,
    guests_frequency    VARCHAR(20),   -- 'Never','Rarely','Often'
    ac_usage            VARCHAR(20),   -- 'Never','Sometimes','Always'
    music_preference    VARCHAR(20),   -- 'Silence','Low volume','Loud'
    study_habit         VARCHAR(20),   -- 'Silent study','Music while studying', etc.
    cooking_frequency   VARCHAR(20),   -- 'Never','Occasionally','Daily'
    privacy_level       INT CHECK (privacy_level BETWEEN 1 AND 5),    -- 1=very social, 5=very private
    socializing_level   INT CHECK (socializing_level BETWEEN 1 AND 5),
    pets_ok             BOOLEAN DEFAULT FALSE
);


-- ============================================================
-- 6. ROOMMATE_MATCHES
-- Stores the calculated compatibility % between two users
-- (computed in Python — see db_connector.py).
-- ============================================================
CREATE TABLE IF NOT EXISTS roommate_matches (
    match_id             SERIAL PRIMARY KEY,
    user_id_1            INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    user_id_2            INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    compatibility_score  NUMERIC(5,2) CHECK (compatibility_score BETWEEN 0 AND 100),
    matched_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (user_id_1 <> user_id_2)
);

CREATE INDEX IF NOT EXISTS idx_match_users ON roommate_matches(user_id_1, user_id_2);


-- ============================================================
-- 7. INVITES
-- Direct invites sent by owners/residents to potential roommates.
-- ============================================================
CREATE TABLE IF NOT EXISTS invites (
    invite_id    SERIAL PRIMARY KEY,
    sender_id    INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    receiver_id  INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    listing_id   INT NOT NULL REFERENCES pg_listings(listing_id) ON DELETE CASCADE,
    status       VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
    sent_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 8. APPLICATIONS
-- Seekers applying to a listing; owners review compatibility
-- score before approving.
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (
    application_id       SERIAL PRIMARY KEY,
    listing_id            INT NOT NULL REFERENCES pg_listings(listing_id) ON DELETE CASCADE,
    applicant_id           INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    compatibility_score   NUMERIC(5,2),
    status                VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    applied_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 9. MESSAGES — In-app direct chat
-- listing_id is nullable because two users might chat before
-- a listing is attached to the conversation.
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    message_id    SERIAL PRIMARY KEY,
    sender_id     INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    receiver_id   INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    listing_id    INT REFERENCES pg_listings(listing_id) ON DELETE SET NULL,
    message_text  TEXT NOT NULL,
    sent_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id);


-- ============================================================
-- 10. RENTAL_AGREEMENTS — AI Rental Agreement Audit
-- Stores the agreement text plus whatever the LLM pipeline
-- flags as unfair (hidden clauses, deposit lock-ins, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS rental_agreements (
    agreement_id          SERIAL PRIMARY KEY,
    listing_id            INT NOT NULL REFERENCES pg_listings(listing_id) ON DELETE CASCADE,
    tenant_id             INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    deposit_amount        NUMERIC(10,2),
    lock_in_period_months INT,
    agreement_text        TEXT,
    ai_flags              TEXT,   -- plain-text summary of issues the LLM found
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- SAMPLE SEED DATA
-- Matches the numbers from your pitch deck so a demo works
-- immediately after running this file.
-- ============================================================

INSERT INTO users (name, email, phone, password_hash, role) VALUES
    ('Rohan Owner',   'rohan.owner@example.com',   '9990000001', 'hash_placeholder_1', 'owner'),
    ('Aditi Seeker',  'aditi.seeker@example.com',  '9990000002', 'hash_placeholder_2', 'seeker'),
    ('Kabir Tenant',  'kabir.tenant@example.com',  '9990000003', 'hash_placeholder_3', 'tenant')
ON CONFLICT (email) DO NOTHING;

INSERT INTO pg_listings (owner_id, title, address, city, latitude, longitude, total_beds, available_beds) VALUES
    (1, 'Green Valley PG', 'Sector 62, Noida', 'Noida', 28.6139, 77.3910, 4, 1);

INSERT INTO cost_breakdown (listing_id, base_rent, electricity, wifi, maintenance, food, laundry, actual_total) VALUES
    (1, 9000, 1000, 300, 500, 2500, 400, 13700);

INSERT INTO neighborhood_truth_layer
    (listing_id, noise_level, safety_score, water_availability, power_outage_freq,
     nearby_food_score, grocery_distance_km, public_transport_score, nightlife_score,
     flooding_risk, construction_nearby, mobile_network_score)
VALUES
    (1, 7, 8, 8, 'Rare (<1 hr)', 9, 0.6, 7, 5, 'Low', FALSE, 6);

INSERT INTO roommate_preferences
    (user_id, sleep_time, wake_time, cleanliness, smoking, drinking, guests_frequency,
     ac_usage, music_preference, study_habit, cooking_frequency, privacy_level,
     socializing_level, pets_ok)
VALUES
    (2, '23:00', '07:00', 4, FALSE, FALSE, 'Rarely', 'Sometimes', 'Low volume', 'Silent study', 'Occasionally', 3, 3, FALSE),
    (3, '23:30', '07:30', 4, FALSE, FALSE, 'Rarely', 'Sometimes', 'Low volume', 'Silent study', 'Occasionally', 3, 3, FALSE);

INSERT INTO roommate_matches (user_id_1, user_id_2, compatibility_score) VALUES
    (2, 3, 91.0);
