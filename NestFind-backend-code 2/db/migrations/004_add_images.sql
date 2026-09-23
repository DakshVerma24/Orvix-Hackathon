-- Add images array to pgs table
ALTER TABLE pgs ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;
