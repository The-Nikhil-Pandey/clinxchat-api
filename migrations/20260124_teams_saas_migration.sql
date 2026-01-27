-- =============================================================
-- ClinxChat SaaS Migration: Team-Based Architecture
-- Created: 2026-01-24
-- =============================================================

-- -------------------------------------------------------------
-- 1. TEAMS TABLE (Workspaces)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    logo VARCHAR(255),
    owner_id INT NOT NULL,
    plan ENUM('free', 'pro', 'enterprise') DEFAULT 'free',
    member_limit INT DEFAULT 5,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id),
    INDEX idx_slug (slug),
    INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 2. TEAM MEMBERS TABLE
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_members (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('owner', 'admin', 'member') DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_team_member (team_id, user_id),
    INDEX idx_team_id (team_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 3. TEAM INVITES TABLE
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_invites (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    role ENUM('admin', 'member') DEFAULT 'member',
    invited_by INT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id),
    INDEX idx_team_invites_token (token),
    INDEX idx_team_invites_email (email),
    INDEX idx_team_invites_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 4. CHANNELS TABLE (Team-scoped chat channels)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channels (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type ENUM('public', 'private', 'dm') DEFAULT 'public',
    is_default BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_channels_team (team_id),
    INDEX idx_channels_type (type),
    UNIQUE KEY unique_channel_name_per_team (team_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 5. CHANNEL MEMBERS TABLE
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_members (
    id INT PRIMARY KEY AUTO_INCREMENT,
    channel_id INT NOT NULL,
    user_id INT NOT NULL,
    is_muted BOOLEAN DEFAULT FALSE,
    last_read_at TIMESTAMP NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_channel_member (channel_id, user_id),
    INDEX idx_channel_members_channel (channel_id),
    INDEX idx_channel_members_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 6. SUBSCRIPTIONS TABLE (Stripe subscriptions)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_id INT NOT NULL,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),
    status ENUM('active', 'canceled', 'past_due', 'trialing', 'incomplete') DEFAULT 'active',
    plan ENUM('free', 'pro', 'enterprise') DEFAULT 'free',
    quantity INT DEFAULT 0,
    current_period_start TIMESTAMP NULL,
    current_period_end TIMESTAMP NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    INDEX idx_subscriptions_team (team_id),
    INDEX idx_subscriptions_stripe (stripe_subscription_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 7. PAYMENTS TABLE (Transaction history)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_id INT NOT NULL,
    stripe_payment_intent_id VARCHAR(255),
    stripe_invoice_id VARCHAR(255),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'GBP',
    status ENUM('pending', 'succeeded', 'failed', 'refunded') DEFAULT 'pending',
    description VARCHAR(255),
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    INDEX idx_payments_team (team_id),
    INDEX idx_payments_stripe (stripe_payment_intent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 8. MODIFY USERS TABLE - Add team reference
-- -------------------------------------------------------------
-- Check if column exists before adding
SET @dbname = DATABASE();
SET @tablename = 'users';
SET @columnname = 'current_team_id';
SET @preparedStatement = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN current_team_id INT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add foreign key if not exists (wrapped in procedure for safety)
-- Note: Run manually if foreign key doesn't exist

-- -------------------------------------------------------------
-- 9. MODIFY MESSAGES TABLE - Add team & channel reference
-- -------------------------------------------------------------
SET @columnname = 'team_id';
SET @preparedStatement = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'messages' AND COLUMN_NAME = @columnname) > 0,
    'SELECT 1',
    'ALTER TABLE messages ADD COLUMN team_id INT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'channel_id';
SET @preparedStatement = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'messages' AND COLUMN_NAME = @columnname) > 0,
    'SELECT 1',
    'ALTER TABLE messages ADD COLUMN channel_id INT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add indexes for new columns
-- ALTER TABLE messages ADD INDEX idx_messages_team (team_id);
-- ALTER TABLE messages ADD INDEX idx_messages_channel (channel_id);

-- -------------------------------------------------------------
-- END OF MIGRATION
-- -------------------------------------------------------------
