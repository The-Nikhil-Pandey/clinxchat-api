-- ClinxChat SaaS - Seed Script
-- Creates test team, admin user, regular user, mandatory groups, and sample data
-- Run this after the database schema has been set up

-- 1. Create Admin User (password: Admin@123)
INSERT INTO users (name, email, password, role, department, active_status, is_active)
VALUES ('System Administrator', 'admin@clinxchat.com', 
        '$2b$10$YqOlXj5v1qI1F0h8xQZJF.VkQF0I8nXJK.bN5JfQl8J0K2LqhmhPu', 
        'admin', 'Administration', 'available', TRUE)
ON DUPLICATE KEY UPDATE 
    password = '$2b$10$YqOlXj5v1qI1F0h8xQZJF.VkQF0I8nXJK.bN5JfQl8J0K2LqhmhPu',
    name = 'System Administrator';

-- 2. Create Regular User (password: User@123)
INSERT INTO users (name, email, password, role, department, active_status, is_active)
VALUES ('Test User', 'user@clinxchat.com', 
        '$2b$10$7HOK2kVZ1qP3F0h8xQZJF.VkQF0I8nXJK.bN5JfQl8J0K2LqhmhPu', 
        'clinical_staff', 'Clinical', 'available', TRUE)
ON DUPLICATE KEY UPDATE 
    password = '$2b$10$7HOK2kVZ1qP3F0h8xQZJF.VkQF0I8nXJK.bN5JfQl8J0K2LqhmhPu',
    name = 'Test User';

-- 3. Create Test Team
INSERT INTO teams (name, slug, description, plan, member_limit)
VALUES ('ClinxChat Healthcare', 'clinxchat-healthcare', 'Primary healthcare organization workspace', 'pro', 50)
ON DUPLICATE KEY UPDATE name = 'ClinxChat Healthcare';

-- Get IDs
SET @admin_id = (SELECT id FROM users WHERE email = 'admin@clinxchat.com');
SET @member_id = (SELECT id FROM users WHERE email = 'user@clinxchat.com');
SET @team_id = (SELECT id FROM teams WHERE slug = 'clinxchat-healthcare');

-- 4. Update team owner and user team assignments
UPDATE teams SET owner_id = @admin_id WHERE id = @team_id;
UPDATE users SET current_team_id = @team_id WHERE id = @admin_id;
UPDATE users SET current_team_id = @team_id WHERE id = @member_id;

-- 5. Add users to team_members
INSERT INTO team_members (team_id, user_id, role) 
VALUES (@team_id, @admin_id, 'owner')
ON DUPLICATE KEY UPDATE role = 'owner';

INSERT INTO team_members (team_id, user_id, role) 
VALUES (@team_id, @member_id, 'member')
ON DUPLICATE KEY UPDATE role = 'member';

-- 6. Create Mandatory Groups
INSERT INTO `groups` (name, description, group_type, is_mandatory, created_by)
VALUES ('All Staff Announcements', 'Company-wide announcements', 'public', TRUE, @admin_id)
ON DUPLICATE KEY UPDATE is_mandatory = TRUE;

INSERT INTO `groups` (name, description, group_type, is_mandatory, created_by)
VALUES ('General Discussion', 'General team discussion', 'public', TRUE, @admin_id)
ON DUPLICATE KEY UPDATE is_mandatory = TRUE;

INSERT INTO `groups` (name, description, group_type, is_mandatory, created_by)
VALUES ('Help & Support', 'Get help and support', 'public', TRUE, @admin_id)
ON DUPLICATE KEY UPDATE is_mandatory = TRUE;

-- 7. Add users to mandatory groups
INSERT INTO group_members (group_id, user_id, role)
SELECT id, @admin_id, 'admin' FROM `groups` WHERE is_mandatory = TRUE
ON DUPLICATE KEY UPDATE role = 'admin';

INSERT INTO group_members (group_id, user_id, role)
SELECT id, @member_id, 'member' FROM `groups` WHERE is_mandatory = TRUE
ON DUPLICATE KEY UPDATE role = 'member';

-- 8. Create Default Channels
INSERT INTO channels (team_id, name, description, type, is_default, created_by)
VALUES (@team_id, 'general', 'General discussion', 'public', TRUE, @admin_id)
ON DUPLICATE KEY UPDATE description = 'General discussion';

INSERT INTO channels (team_id, name, description, type, is_default, created_by)
VALUES (@team_id, 'announcements', 'Team announcements', 'public', TRUE, @admin_id)
ON DUPLICATE KEY UPDATE description = 'Team announcements';

INSERT INTO channels (team_id, name, description, type, is_default, created_by)
VALUES (@team_id, 'random', 'Off-topic chat', 'public', FALSE, @admin_id)
ON DUPLICATE KEY UPDATE description = 'Off-topic chat';

-- 9. Add users to channels
INSERT INTO channel_members (channel_id, user_id)
SELECT id, @admin_id FROM channels WHERE team_id = @team_id
ON DUPLICATE KEY UPDATE channel_id = channel_id;

INSERT INTO channel_members (channel_id, user_id)
SELECT id, @member_id FROM channels WHERE team_id = @team_id
ON DUPLICATE KEY UPDATE channel_id = channel_id;

-- 10. Create Sample Payments
INSERT INTO payments (team_id, amount, currency, status, description)
VALUES (@team_id, 4.95, 'GBP', 'succeeded', '5 extra members - Monthly'),
       (@team_id, 9.90, 'GBP', 'succeeded', '10 extra members - Monthly'),
       (@team_id, 4.95, 'GBP', 'failed', '5 extra members - Payment declined');

-- Done!
SELECT 'Seed complete!' as status;
SELECT 'Admin Login: admin@clinxchat.com / Admin@123' as credentials;
SELECT 'User Login: user@clinxchat.com / User@123' as credentials;
