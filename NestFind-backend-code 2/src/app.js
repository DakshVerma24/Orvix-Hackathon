import cors from 'cors';
import express from 'express';
import { query } from './db.js';

export const app = express();
app.use(cors());
app.use(express.json());

const fields = [
  'name', 'description', 'address', 'city', 'latitude', 'longitude', 'owner_id',
  'contact_name', 'contact_phone', 'base_rent', 'food_charge', 'electricity_charge',
  'maintenance_charge', 'security_deposit', 'amenities'
];

function publicPg(row) {
  return {
    ...row,
    true_monthly_rent: Number(row.base_rent) + Number(row.food_charge) +
      Number(row.electricity_charge) + Number(row.maintenance_charge)
  };
}

function validatePg(body, partial = false) {
  if (!partial) {
    for (const field of ['name', 'address', 'city']) {
      if (!body[field] || typeof body[field] !== 'string') return `${field} is required`;
    }
  }
  if (body.amenities !== undefined && !Array.isArray(body.amenities)) return 'amenities must be an array';
  for (const field of ['latitude', 'longitude']) {
    if (body[field] !== undefined && !Number.isFinite(Number(body[field]))) return `${field} must be a number`;
  }
  return null;
}

function databaseValue(field, value) {
  return field === 'amenities' ? JSON.stringify(value) : value;
}

function validateRoom(body, partial = false) {
  if (!partial) {
    for (const field of ['room_number', 'capacity']) {
      if (body[field] === undefined || body[field] === '') return `${field} is required`;
    }
  }
  for (const field of ['capacity', 'occupied_beds']) {
    if (body[field] !== undefined && (!Number.isInteger(Number(body[field])) || Number(body[field]) < 0)) {
      return `${field} must be a non-negative whole number`;
    }
  }
  if (body.capacity !== undefined && body.occupied_beds !== undefined && Number(body.occupied_beds) > Number(body.capacity)) {
    return 'occupied_beds cannot exceed capacity';
  }
  if (body.rent_override !== undefined && (!Number.isFinite(Number(body.rent_override)) || Number(body.rent_override) < 0)) {
    return 'rent_override must be a non-negative number';
  }
  return null;
}

function publicRoom(row) {
  return { ...row, available_beds: Number(row.capacity) - Number(row.occupied_beds) };
}

// All preferences are a 1–5 scale. A close score means compatible preferences.
const matchingFactors = [
  'sleep_schedule', 'cleanliness', 'noise_tolerance', 'social_level',
  'guest_frequency', 'study_habits', 'food_preference', 'smoking_preference',
  'drinking_preference', 'sharing_preference', 'temperature_preference',
  'budget_level', 'work_schedule'
];

function validatePreferences(preferences) {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return 'preferences must be an object containing the 13 matching factors';
  }
  for (const factor of matchingFactors) {
    const value = Number(preferences[factor]);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return `${factor} must be a whole number from 1 to 5`;
    }
  }
  return null;
}

function matchResult(profile, candidate) {
  const differences = matchingFactors.map((factor) => Math.abs(
    Number(profile.preferences[factor]) - Number(candidate.preferences[factor])
  ));
  const totalDifference = differences.reduce((sum, difference) => sum + difference, 0);
  const score = Math.round((1 - totalDifference / (matchingFactors.length * 4)) * 100);
  const closestFactors = matchingFactors
    .map((factor, index) => ({ factor, difference: differences[index] }))
    .sort((a, b) => a.difference - b.difference)
    .slice(0, 3)
    .map(({ factor }) => factor);
  return { ...candidate, compatibility_score: score, strongest_matches: closestFactors };
}

function validateContact(body, requiredNames) {
  for (const field of requiredNames) {
    if (!body[field] || typeof body[field] !== 'string') return `${field} is required`;
  }
  if (body.applicant_email !== undefined && typeof body.applicant_email !== 'string') return 'applicant_email must be a string';
  if (body.recipient_email !== undefined && typeof body.recipient_email !== 'string') return 'recipient_email must be a string';
  return null;
}

app.get('/health', async (_req, res, next) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) { next(error); }
});

app.get('/api/pgs', async (req, res, next) => {
  try {
    const { city } = req.query;
    const result = city
      ? await query('SELECT * FROM pgs WHERE LOWER(city) = LOWER($1) ORDER BY created_at DESC', [city])
      : await query('SELECT * FROM pgs ORDER BY created_at DESC');
    res.json(result.rows.map(publicPg));
  } catch (error) { next(error); }
});

app.get('/api/pgs/nearby', async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm ?? 5);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm) || radiusKm <= 0) {
      return res.status(400).json({ error: 'lat, lng, and a positive radiusKm are required' });
    }
    const result = await query(`
      SELECT *, 6371 * acos(LEAST(1, GREATEST(-1,
        cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2)) +
        sin(radians($1)) * sin(radians(latitude))
      ))) AS distance_km
      FROM pgs WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY distance_km ASC`, [lat, lng]);
    res.json(result.rows.filter((pg) => Number(pg.distance_km) <= radiusKm).map(publicPg));
  } catch (error) { next(error); }
});

app.post('/api/pgs', async (req, res, next) => {
  try {
    const validationError = validatePg(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    // Omit absent optional fields so PostgreSQL can apply schema defaults.
    const provided = fields.filter((field) => req.body[field] !== undefined);
    const insertFields = provided.includes('amenities') ? provided : [...provided, 'amenities'];
    const values = insertFields.map((field) => databaseValue(field, req.body[field] ?? []));
    const placeholders = insertFields.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query(
      `INSERT INTO pgs (${insertFields.join(', ')}) VALUES (${placeholders}) RETURNING *`, values
    );
    res.status(201).json(publicPg(result.rows[0]));
  } catch (error) { next(error); }
});

app.get('/api/pgs/:id', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM pgs WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'PG not found' });
    res.json(publicPg(result.rows[0]));
  } catch (error) { next(error); }
});

app.patch('/api/pgs/:id', async (req, res, next) => {
  try {
    const validationError = validatePg(req.body, true);
    if (validationError) return res.status(400).json({ error: validationError });
    const entries = fields.filter((field) => req.body[field] !== undefined);
    if (!entries.length) return res.status(400).json({ error: 'No editable fields provided' });
    const setClause = entries.map((field, i) => `${field} = $${i + 1}`).join(', ');
    const result = await query(
      `UPDATE pgs SET ${setClause} WHERE id = $${entries.length + 1} RETURNING *`,
      [...entries.map((field) => databaseValue(field, req.body[field])), req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'PG not found' });
    res.json(publicPg(result.rows[0]));
  } catch (error) { next(error); }
});

app.delete('/api/pgs/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM pgs WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'PG not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/pgs/:pgId/rooms', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM rooms WHERE pg_id = $1 ORDER BY room_number ASC', [req.params.pgId]
    );
    res.json(result.rows.map(publicRoom));
  } catch (error) { next(error); }
});

app.post('/api/pgs/:pgId/rooms', async (req, res, next) => {
  try {
    const validationError = validateRoom(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const result = await query(
      `INSERT INTO rooms (pg_id, room_number, capacity, occupied_beds, rent_override)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.pgId, req.body.room_number, req.body.capacity, req.body.occupied_beds ?? 0, req.body.rent_override ?? null]
    );
    res.status(201).json(publicRoom(result.rows[0]));
  } catch (error) {
    if (error.code === '23503') return res.status(404).json({ error: 'PG not found' });
    next(error);
  }
});

app.patch('/api/rooms/:id', async (req, res, next) => {
  try {
    const validationError = validateRoom(req.body, true);
    if (validationError) return res.status(400).json({ error: validationError });
    const fields = ['room_number', 'capacity', 'occupied_beds', 'rent_override'];
    const entries = fields.filter((field) => req.body[field] !== undefined);
    if (!entries.length) return res.status(400).json({ error: 'No editable fields provided' });
    const setClause = entries.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const result = await query(
      `UPDATE rooms SET ${setClause} WHERE id = $${entries.length + 1} RETURNING *`,
      [...entries.map((field) => req.body[field]), req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Room not found' });
    res.json(publicRoom(result.rows[0]));
  } catch (error) {
    if (error.code === '23514') return res.status(400).json({ error: 'occupied_beds cannot exceed capacity' });
    if (error.code === '23505') return res.status(409).json({ error: 'Room number already exists for this PG' });
    next(error);
  }
});

app.delete('/api/rooms/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM rooms WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Room not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/pgs/:pgId/applications', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT applications.*, rooms.room_number AS preferred_room_number
       FROM applications LEFT JOIN rooms ON rooms.id = applications.preferred_room_id
       WHERE applications.pg_id = $1 ORDER BY applications.created_at DESC`, [req.params.pgId]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post('/api/pgs/:pgId/applications', async (req, res, next) => {
  try {
    const validationError = validateContact(req.body, ['applicant_name']);
    if (validationError) return res.status(400).json({ error: validationError });
    const result = await query(
      `INSERT INTO applications
        (pg_id, applicant_name, applicant_phone, applicant_email, preferred_room_id, move_in_date, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.pgId, req.body.applicant_name, req.body.applicant_phone ?? null,
        req.body.applicant_email ?? null, req.body.preferred_room_id ?? null,
        req.body.move_in_date ?? null, req.body.message ?? null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') return res.status(404).json({ error: 'PG or preferred room not found' });
    next(error);
  }
});

app.patch('/api/applications/:id/status', async (req, res, next) => {
  try {
    const allowedStatuses = ['pending', 'accepted', 'rejected', 'withdrawn'];
    if (!allowedStatuses.includes(req.body.status)) return res.status(400).json({ error: 'Invalid application status' });
    const result = await query(
      'UPDATE applications SET status = $1 WHERE id = $2 RETURNING *', [req.body.status, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Application not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get('/api/pgs/:pgId/invites', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM invites WHERE pg_id = $1 ORDER BY created_at DESC', [req.params.pgId]);
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post('/api/pgs/:pgId/invites', async (req, res, next) => {
  try {
    const validationError = validateContact(req.body, ['recipient_name', 'sent_by_name']);
    if (validationError) return res.status(400).json({ error: validationError });
    const result = await query(
      `INSERT INTO invites (pg_id, recipient_name, recipient_phone, recipient_email, sent_by_name, message, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.pgId, req.body.recipient_name, req.body.recipient_phone ?? null,
        req.body.recipient_email ?? null, req.body.sent_by_name, req.body.message ?? null,
        req.body.expires_at ?? null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') return res.status(404).json({ error: 'PG not found' });
    next(error);
  }
});

app.patch('/api/invites/:id/status', async (req, res, next) => {
  try {
    const allowedStatuses = ['pending', 'accepted', 'declined', 'cancelled'];
    if (!allowedStatuses.includes(req.body.status)) return res.status(400).json({ error: 'Invalid invite status' });
    const result = await query(
      'UPDATE invites SET status = $1 WHERE id = $2 RETURNING *', [req.body.status, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Invite not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get('/api/roommate-factors', (_req, res) => {
  res.json({
    scale: '1 means the first end of a preference; 5 means the other end. Similar values score higher.',
    factors: matchingFactors
  });
});

app.post('/api/roommate-profiles', async (req, res, next) => {
  try {
    if (!req.body.display_name || typeof req.body.display_name !== 'string') {
      return res.status(400).json({ error: 'display_name is required' });
    }
    const validationError = validatePreferences(req.body.preferences);
    if (validationError) return res.status(400).json({ error: validationError });
    const result = await query(
      `INSERT INTO roommate_profiles (display_name, pg_id, bio, preferences)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.body.display_name, req.body.pg_id ?? null, req.body.bio ?? null, JSON.stringify(req.body.preferences)]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') return res.status(404).json({ error: 'PG not found' });
    next(error);
  }
});

app.get('/api/roommate-profiles/:id', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM roommate_profiles WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Roommate profile not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.patch('/api/roommate-profiles/:id', async (req, res, next) => {
  try {
    if (req.body.preferences !== undefined) {
      const validationError = validatePreferences(req.body.preferences);
      if (validationError) return res.status(400).json({ error: validationError });
    }
    const editable = ['display_name', 'pg_id', 'bio', 'preferences'];
    const entries = editable.filter((field) => req.body[field] !== undefined);
    if (!entries.length) return res.status(400).json({ error: 'No editable fields provided' });
    const setClause = entries.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = entries.map((field) => field === 'preferences'
      ? JSON.stringify(req.body[field]) : req.body[field]);
    const result = await query(
      `UPDATE roommate_profiles SET ${setClause} WHERE id = $${entries.length + 1} RETURNING *`,
      [...values, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Roommate profile not found' });
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23503') return res.status(404).json({ error: 'PG not found' });
    next(error);
  }
});

app.delete('/api/roommate-profiles/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM roommate_profiles WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Roommate profile not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/roommate-profiles/:id/matches', async (req, res, next) => {
  try {
    const profileResult = await query('SELECT * FROM roommate_profiles WHERE id = $1', [req.params.id]);
    if (!profileResult.rowCount) return res.status(404).json({ error: 'Roommate profile not found' });
    const profile = profileResult.rows[0];
    const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
    const candidatesResult = profile.pg_id
      ? await query('SELECT * FROM roommate_profiles WHERE id <> $1 AND pg_id = $2', [profile.id, profile.pg_id])
      : await query('SELECT * FROM roommate_profiles WHERE id <> $1', [profile.id]);
    const matches = candidatesResult.rows
      .map((candidate) => matchResult(profile, candidate))
      .sort((a, b) => b.compatibility_score - a.compatibility_score)
      .slice(0, limit);
    res.json({ profile_id: profile.id, matching_factors: matchingFactors, matches });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});
