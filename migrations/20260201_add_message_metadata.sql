-- Migration to add metadata support to messages table
-- This allows storing aspect ratio, file size, and other media-specific info

ALTER TABLE messages ADD COLUMN metadata JSON AFTER duration;

-- Ensure message_type has 'video' if not already there (though it should be)
-- ALTER TABLE messages MODIFY COLUMN message_type ENUM('text', 'image', 'pdf', 'voice', 'video') DEFAULT 'text';
