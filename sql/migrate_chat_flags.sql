-- Migration script for Chat Management Features
-- Adds Favorite, Archive, and Pin support to chat participants

USE `clinxchat`; -- Replace with your actual database name if different

ALTER TABLE chat_participants 
ADD COLUMN is_favourite BOOLEAN DEFAULT FALSE,
ADD COLUMN is_archived BOOLEAN DEFAULT FALSE,
ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE;

-- Optional: Add indexes for better performance on large datasets
CREATE INDEX idx_cp_is_favourite ON chat_participants(is_favourite);
CREATE INDEX idx_cp_is_archived ON chat_participants(is_archived);
CREATE INDEX idx_cp_is_pinned ON chat_participants(is_pinned);
