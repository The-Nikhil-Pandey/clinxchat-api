-- Migration: Create user_settings table
-- Date: 2026-01-16
-- Description: Stores user preferences for Settings & Configuration screen

CREATE TABLE IF NOT EXISTS user_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    
    -- General Settings
    language VARCHAR(20) DEFAULT 'English',
    theme ENUM('Auto', 'Light', 'Dark') DEFAULT 'Auto',
    font_size DECIMAL(3,2) DEFAULT 0.50,
    notification_sound BOOLEAN DEFAULT TRUE,
    desktop_notifications BOOLEAN DEFAULT TRUE,
    
    -- Messaging Settings
    delay_send BOOLEAN DEFAULT TRUE,
    delay_send_seconds INT DEFAULT 10,
    read_receipts BOOLEAN DEFAULT FALSE,
    enter_key_behavior ENUM('send', 'newline') DEFAULT 'send',
    auto_download_media BOOLEAN DEFAULT TRUE,
    link_preview BOOLEAN DEFAULT TRUE,
    
    -- Security Settings
    session_timeout VARCHAR(20) DEFAULT '15 Minutes',
    auto_logout BOOLEAN DEFAULT TRUE,
    biometric_auth BOOLEAN DEFAULT TRUE,
    
    -- Archiving Settings
    auto_archive BOOLEAN DEFAULT TRUE,
    auto_archive_days INT DEFAULT 30,
    
    -- Bin/Trash Settings
    auto_purge_period VARCHAR(20) DEFAULT '1 Week',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_settings_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
