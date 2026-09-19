"""
NestFind AI — SQL <-> Python Connector
========================================
Hackathon Project 2026

This file connects your Python backend to the PostgreSQL database
created by nestfind_schema.sql, and gives you ready-made functions
for every core feature in the deck:

    - Users & listings
    - True Rent calculator
    - Neighborhood Truth Layer
    - 13-parameter roommate compatibility scoring
    - Invites, applications, messages

Everything is written with plain, commented code so it's easy for
the whole team to read and extend during the hackathon.

------------------------------------------------------------------
SETUP (do this once):
------------------------------------------------------------------
1. Install PostgreSQL locally (or use a free hosted DB like
   Neon / Supabase / Railway — much faster for a hackathon).
2. Install the Python driver:
       pip install psycopg2-binary
3. Fill in DB_CONFIG below with your real credentials.
4. Run nestfind_schema.sql once against your database to create
   all the tables (see the README notes at the bottom of this file
   for exact commands).
5. Run this file:  python db_connector.py
   It will run a small demo showing everything working end-to-end.
------------------------------------------------------------------
"""

import psycopg2
from psycopg2.extras import RealDictCursor

# ------------------------------------------------------------------
# 1. DATABASE CONFIG — edit these values for your setup
# ------------------------------------------------------------------
DB_CONFIG = {
    "host": "localhost",       # or your hosted DB's host address
    "port": 5432,
    "dbname": "postgres",     # or your database name
    "user": "postgres",
    "password": "4987",
}


def get_connection():
    """Opens and returns a new database connection."""
    return psycopg2.connect(**DB_CONFIG)


# ------------------------------------------------------------------
# 2. USERS
# ------------------------------------------------------------------
def add_user(name, email, phone, password_hash, role):
    """Insert a new user (owner / tenant / seeker). Returns the new user_id."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO users (name, email, phone, password_hash, role)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING user_id;
        """,
        (name, email, phone, password_hash, role),
    )
    user_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return user_id


def get_user_by_email(email):
    """Fetch one user by email. Returns a dict, or None if not found."""
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM users WHERE email = %s;", (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()
    return user


# ------------------------------------------------------------------
# 3. LISTINGS + TRUE RENT CALCULATOR
# ------------------------------------------------------------------
def add_listing(owner_id, title, address, city, latitude, longitude,
                 total_beds=1, available_beds=1):
    """Create a new PG/flat listing. Returns the new listing_id."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO pg_listings
            (owner_id, title, address, city, latitude, longitude, total_beds, available_beds)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING listing_id;
        """,
        (owner_id, title, address, city, latitude, longitude, total_beds, available_beds),
    )
    listing_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return listing_id


def add_cost_breakdown(listing_id, base_rent, electricity, wifi,
                        maintenance, food, laundry):
    """
    Save the True Rent breakdown for a listing.
    actual_total is calculated here in Python, not left to the owner.
    """
    actual_total = base_rent + electricity + wifi + maintenance + food + laundry
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO cost_breakdown
            (listing_id, base_rent, electricity, wifi, maintenance, food, laundry, actual_total)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING cost_id;
        """,
        (listing_id, base_rent, electricity, wifi, maintenance, food, laundry, actual_total),
    )
    cost_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return cost_id, actual_total


def get_true_rent(listing_id):
    """Return the full cost breakdown dict for a listing."""
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM cost_breakdown WHERE listing_id = %s;", (listing_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row


# ------------------------------------------------------------------
# 4. NEIGHBORHOOD TRUTH LAYER
# ------------------------------------------------------------------
def add_truth_layer(listing_id, noise_level, safety_score, water_availability,
                     power_outage_freq, nearby_food_score, grocery_distance_km,
                     public_transport_score, nightlife_score, flooding_risk,
                     construction_nearby, mobile_network_score):
    """Save (or update) the neighborhood metrics for a listing."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO neighborhood_truth_layer
            (listing_id, noise_level, safety_score, water_availability, power_outage_freq,
             nearby_food_score, grocery_distance_km, public_transport_score, nightlife_score,
             flooding_risk, construction_nearby, mobile_network_score)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING truth_id;
        """,
        (listing_id, noise_level, safety_score, water_availability, power_outage_freq,
         nearby_food_score, grocery_distance_km, public_transport_score, nightlife_score,
         flooding_risk, construction_nearby, mobile_network_score),
    )
    truth_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return truth_id


def get_nearby_listings(user_lat, user_lon, radius_km=5):
    """
    Simple 'Geo-Radius Radar': returns every listing within
    radius_km of the user's location, using the Haversine formula
    computed directly in SQL.
    """
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        SELECT * FROM (
            SELECT *,
                ( 6371 * acos(
                    cos(radians(%s)) * cos(radians(latitude)) *
                    cos(radians(longitude) - radians(%s)) +
                    sin(radians(%s)) * sin(radians(latitude))
                ) ) AS distance_km
            FROM pg_listings
            WHERE available_beds > 0
        ) AS listings_with_distance
        WHERE distance_km <= %s
        ORDER BY distance_km ASC;
        """,
        (user_lat, user_lon, user_lat, radius_km),
    )
    # Note: some PostgreSQL versions need GROUP BY for HAVING without
    # aggregation — if this errors, wrap the query in a subquery
    # and filter with WHERE on the outer query instead.
    results = cur.fetchall()
    cur.close()
    conn.close()
    return results


# ------------------------------------------------------------------
# 5. ROOMMATE MATCHING — 13-parameter compatibility engine
# ------------------------------------------------------------------
def add_roommate_preferences(user_id, sleep_time, wake_time, cleanliness,
                              smoking, drinking, guests_frequency, ac_usage,
                              music_preference, study_habit, cooking_frequency,
                              privacy_level, socializing_level, pets_ok):
    """Save a user's lifestyle preferences (one row per user)."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO roommate_preferences
            (user_id, sleep_time, wake_time, cleanliness, smoking, drinking,
             guests_frequency, ac_usage, music_preference, study_habit,
             cooking_frequency, privacy_level, socializing_level, pets_ok)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (user_id) DO UPDATE SET
            sleep_time = EXCLUDED.sleep_time,
            wake_time = EXCLUDED.wake_time,
            cleanliness = EXCLUDED.cleanliness,
            smoking = EXCLUDED.smoking,
            drinking = EXCLUDED.drinking,
            guests_frequency = EXCLUDED.guests_frequency,
            ac_usage = EXCLUDED.ac_usage,
            music_preference = EXCLUDED.music_preference,
            study_habit = EXCLUDED.study_habit,
            cooking_frequency = EXCLUDED.cooking_frequency,
            privacy_level = EXCLUDED.privacy_level,
            socializing_level = EXCLUDED.socializing_level,
            pets_ok = EXCLUDED.pets_ok
        RETURNING pref_id;
        """,
        (user_id, sleep_time, wake_time, cleanliness, smoking, drinking,
         guests_frequency, ac_usage, music_preference, study_habit,
         cooking_frequency, privacy_level, socializing_level, pets_ok),
    )
    pref_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return pref_id


def _get_preferences(user_id):
    """Internal helper: fetch one user's preference row as a dict."""
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM roommate_preferences WHERE user_id = %s;", (user_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row


def calculate_compatibility(user_id_1, user_id_2):
    """
    Compares two users across all 13 lifestyle parameters and
    returns a compatibility percentage (0-100).

    Scoring logic (simple and explainable — good for a hackathon demo):
      - Boolean fields (smoking, drinking, pets_ok): +1 point if they match.
      - Numeric 1-5 fields (cleanliness, privacy_level, socializing_level):
        award points based on how close the two values are.
      - Categorical text fields (guests_frequency, ac_usage, music_preference,
        study_habit, cooking_frequency): +1 point if they match exactly.
      - Sleep/wake time: +1 point if within 1 hour of each other.

    Total points scored out of 13, converted to a percentage.
    """
    p1 = _get_preferences(user_id_1)
    p2 = _get_preferences(user_id_2)

    if not p1 or not p2:
        raise ValueError("Both users must have saved roommate preferences first.")

    score = 0
    total_params = 13

    # Boolean matches
    for field in ["smoking", "drinking", "pets_ok"]:
        if p1[field] == p2[field]:
            score += 1

    # Numeric closeness (1-5 scale) — full point if equal, half if within 1
    for field in ["cleanliness", "privacy_level", "socializing_level"]:
        diff = abs(p1[field] - p2[field])
        if diff == 0:
            score += 1
        elif diff == 1:
            score += 0.5

    # Categorical exact matches
    for field in ["guests_frequency", "ac_usage", "music_preference",
                  "study_habit", "cooking_frequency"]:
        if p1[field] == p2[field]:
            score += 1

    # Sleep/wake time closeness (within 1 hour counts as a match)
    for field in ["sleep_time", "wake_time"]:
        t1, t2 = p1[field], p2[field]
        if t1 and t2:
            diff_minutes = abs((t1.hour * 60 + t1.minute) - (t2.hour * 60 + t2.minute))
            if diff_minutes <= 60:
                score += 1

    compatibility_percent = round((score / total_params) * 100, 2)
    return compatibility_percent


def save_match(user_id_1, user_id_2, compatibility_score):
    """Store a calculated match result in the database."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO roommate_matches (user_id_1, user_id_2, compatibility_score)
        VALUES (%s, %s, %s)
        RETURNING match_id;
        """,
        (user_id_1, user_id_2, compatibility_score),
    )
    match_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return match_id


# ------------------------------------------------------------------
# 6. MESSAGES (simple chat, without Socket.io — that's the real-time
#    layer; this just persists messages to the database)
# ------------------------------------------------------------------
def send_message(sender_id, receiver_id, message_text, listing_id=None):
    """Insert a new chat message."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO messages (sender_id, receiver_id, listing_id, message_text)
        VALUES (%s, %s, %s, %s)
        RETURNING message_id;
        """,
        (sender_id, receiver_id, listing_id, message_text),
    )
    message_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return message_id


def get_conversation(user_id_1, user_id_2):
    """Fetch every message between two users, oldest first."""
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        SELECT * FROM messages
        WHERE (sender_id = %s AND receiver_id = %s)
           OR (sender_id = %s AND receiver_id = %s)
        ORDER BY sent_at ASC;
        """,
        (user_id_1, user_id_2, user_id_2, user_id_1),
    )
    messages = cur.fetchall()
    cur.close()
    conn.close()
    return messages


# ------------------------------------------------------------------
# 7. DEMO — run this file directly to see everything work together
# ------------------------------------------------------------------
if __name__ == "__main__":
    print("Connecting to NestFind AI database...")
    try:
        # This demo assumes you've already run nestfind_schema.sql,
        # which seeds users 2 and 3 (Aditi & Kabir) with matching
        # roommate preferences.
        score = calculate_compatibility(2, 3)
        print(f"Compatibility between user 2 and user 3: {score}%")

        rent = get_true_rent(1)
        print(f"True Rent for listing 1: {rent}")

        nearby = get_nearby_listings(user_lat=28.61, user_lon=77.39, radius_km=5)
        print(f"Found {len(nearby)} listing(s) nearby.")

    except Exception as e:
        print("Something went wrong — check your DB_CONFIG and that")
        print("nestfind_schema.sql has been run against your database.")
        print(f"Error: {e}")


"""
------------------------------------------------------------------
README NOTES — quick reference
------------------------------------------------------------------
Run the schema file against your database from a terminal:

    psql -U postgres -d nestfind_db -f nestfind_schema.sql

(If nestfind_db doesn't exist yet, create it first:
    createdb -U postgres nestfind_db
 or in psql:
    CREATE DATABASE nestfind_db;
)

Then run this file:

    python db_connector.py
------------------------------------------------------------------
"""
