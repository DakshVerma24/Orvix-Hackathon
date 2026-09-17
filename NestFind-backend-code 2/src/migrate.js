import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pool } from './db.js';

const migrationPath = new URL('../db/migrations/001_initial_schema.sql', import.meta.url);

try {
  const sql = await readFile(migrationPath, 'utf8');
  await pool.query(sql);
  console.log('Migration 001_initial_schema.sql completed.');
} finally {
  await pool.end();
}
