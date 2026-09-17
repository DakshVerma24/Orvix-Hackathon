# NestFind backend — milestone 1

An authentication-free Express + PostgreSQL API for PG listings. Authentication will be added later; `owner_id` is kept nullable so the future users table can attach cleanly.

## Prerequisites

- Node.js 20 or newer
- PostgreSQL 15 or newer

## Run locally

```bash
cp .env.example .env
createdb nestfind
npm install
npm run db:migrate
npm run dev
```

The API starts at `http://localhost:3001`.

## Available endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | API and database health check |
| GET | `/api/pgs` | List PGs; optional `?city=Bengaluru` |
| POST | `/api/pgs` | Create a PG listing |
| GET | `/api/pgs/:id` | Get one listing |
| PATCH | `/api/pgs/:id` | Update a listing |
| DELETE | `/api/pgs/:id` | Delete a listing |
| GET | `/api/pgs/nearby?lat=12.9716&lng=77.5946&radiusKm=5` | Nearby search |
| GET | `/api/pgs/:pgId/rooms` | List a PG's rooms and available beds |
| POST | `/api/pgs/:pgId/rooms` | Create a room |
| PATCH | `/api/rooms/:id` | Update room capacity, occupancy, or rent |
| DELETE | `/api/rooms/:id` | Delete a room |
| GET | `/api/pgs/:pgId/applications` | List PG applications |
| POST | `/api/pgs/:pgId/applications` | Submit a PG application |
| PATCH | `/api/applications/:id/status` | Accept, reject, or withdraw an application |
| GET | `/api/pgs/:pgId/invites` | List PG invitations |
| POST | `/api/pgs/:pgId/invites` | Send an invitation |
| PATCH | `/api/invites/:id/status` | Accept, decline, or cancel an invitation |
| GET | `/api/roommate-factors` | List the 13 compatibility factors |
| POST | `/api/roommate-profiles` | Create a roommate preference profile |
| GET | `/api/roommate-profiles/:id` | View a profile |
| PATCH | `/api/roommate-profiles/:id` | Update a profile |
| DELETE | `/api/roommate-profiles/:id` | Delete a profile |
| GET | `/api/roommate-profiles/:id/matches` | Get highest-scoring matches |

### Create a PG

```json
{
  "name": "Green Nest PG",
  "address": "12 MG Road",
  "city": "Bengaluru",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "base_rent": 9000,
  "food_charge": 2500,
  "electricity_charge": 500,
  "maintenance_charge": 300,
  "security_deposit": 18000,
  "amenities": ["Wi-Fi", "Food", "Washing machine"]
}
```

Every response includes `true_monthly_rent`, calculated from the four monthly charges. The deposit is deliberately excluded because it is one-time.

### Create a room

```json
{
  "room_number": "A-101",
  "capacity": 3,
  "occupied_beds": 1,
  "rent_override": 10500
}
```

Room responses include `available_beds`. Omit `rent_override` when every bed in that room uses the PG's true monthly rent.
