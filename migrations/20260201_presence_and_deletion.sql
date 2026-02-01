-- Migration: Add presence and message deletion fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted_everyone BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_users JSON DEFAULT (JSON_ARRAY());
