-- Migration: Add profile settings columns to users table
-- Date: 2026-01-14

-- Add new columns to users table (MySQL compatible syntax)
-- Note: Run these one by one, or use stored procedure for IF NOT EXISTS logic

-- Add profile_visibility column
ALTER TABLE users ADD COLUMN profile_visibility ENUM('everyone', 'contacts', 'nobody') DEFAULT 'everyone';

-- Add read_receipts column
ALTER TABLE users ADD COLUMN read_receipts BOOLEAN DEFAULT TRUE;

-- Add online_visibility column
ALTER TABLE users ADD COLUMN online_visibility BOOLEAN DEFAULT TRUE;

-- Add two_factor_enabled column
ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE;

-- Add two_factor_secret column
ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(255);

-- Create user_devices table
CREATE TABLE IF NOT EXISTS user_devices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    device_type ENUM('phone', 'tablet', 'laptop', 'desktop') DEFAULT 'phone',
    push_token VARCHAR(255),
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_devices (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
