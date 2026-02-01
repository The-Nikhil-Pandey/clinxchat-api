-- Migration: Group Overhaul Updates
-- Support for system messages, owner transitions, and member exit states.

-- 1. Update message_type in messages table to include 'system'
ALTER TABLE messages MODIFY COLUMN message_type ENUM('text', 'image', 'pdf', 'voice', 'video', 'system') DEFAULT 'text';

-- 2. Add exited_at to chat_participants to track when a user leaves a group but keeps the chat
ALTER TABLE chat_participants ADD COLUMN exited_at TIMESTAMP NULL;

-- 3. Ensure disappearing_days exists in groups (it should, but just in case)
-- ALTER TABLE `groups` ADD COLUMN disappearing_days INT DEFAULT 0;

-- 4. Add system_type to messages (optional, but helps categorize system messages)
-- We can also just use content for system messages or a JSON metadata field which already exists.

-- 5. Add notifications for group join/leave events to the system
-- These will be handled by the backend logic sending 'system' messages.
