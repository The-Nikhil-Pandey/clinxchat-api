const mysql = require('mysql2/promise');
require('dotenv').config();

// Create connection pool for better performance
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test database connection
const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
};

// Helpers to handle transient DB errors and retry queries
const isTransientError = (err) => {
    if (!err || !err.code) return false;
    const transientCodes = ['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'];
    return transientCodes.includes(err.code) || err.fatal === true;
};

const queryWithRetry = async (sql, params = [], attempts = 3) => {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            return await pool.query(sql, params);
        } catch (err) {
            lastErr = err;
            if (isTransientError(err) && i < attempts - 1) {
                console.warn(`Transient DB error (${err.code || err.message}). Retrying (${i + 1}/${attempts - 1})...`);
                // small backoff
                await new Promise((r) => setTimeout(r, 150 * (i + 1)));
                continue;
            }
            throw err;
        }
    }
    throw lastErr;
};

// Attach error handler to connections obtained from pool
pool.on && pool.on('connection', (connection) => {
    connection.on('error', (err) => {
        console.error('MySQL connection error event:', err && err.code ? err.code : err);
    });
});

// Graceful logging for unhandled rejections
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection at:', reason);
});

// Initialize database and create all tables
const initializeDatabase = async () => {
    try {
        // First create the database if it doesn't exist
        const tempConnection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        });

        await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
        await tempConnection.end();

        // Create users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'clinical_staff') DEFAULT 'clinical_staff',
                department VARCHAR(100),
                profile_picture VARCHAR(255),
                active_status ENUM('available', 'away', 'dnd') DEFAULT 'available',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_email (email),
                INDEX idx_role (role)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Users table initialized');

        // Create contacts table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contacts (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                contact_user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_contact (user_id, contact_user_id),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Contacts table initialized');

        // Create chats table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chats (
                id INT PRIMARY KEY AUTO_INCREMENT,
                type ENUM('private', 'group') NOT NULL,
                group_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_type (type),
                INDEX idx_group_id (group_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Chats table initialized');

        // Create chat_participants table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_participants (
                id INT PRIMARY KEY AUTO_INCREMENT,
                chat_id INT NOT NULL,
                user_id INT NOT NULL,
                FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_participant (chat_id, user_id),
                INDEX idx_chat_id (chat_id),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Chat participants table initialized');

        // Create messages table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT PRIMARY KEY AUTO_INCREMENT,
                chat_id INT NOT NULL,
                sender_id INT NOT NULL,
                message_type ENUM('text', 'image', 'pdf', 'voice', 'video') DEFAULT 'text',
                content TEXT,
                file_path VARCHAR(255),
                duration INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                seen_at TIMESTAMP NULL,
                delivered_at TIMESTAMP NULL,
                FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_chat_id (chat_id),
                INDEX idx_sender_id (sender_id),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Ensure delivered_at column exists for messages table
        try {
            const [cols] = await pool.query(`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'delivered_at'`);
            if (cols[0] && cols[0].cnt === 0) {
                await pool.query(`ALTER TABLE messages ADD COLUMN delivered_at TIMESTAMP NULL`);
                console.log('ℹ️ Added missing column `delivered_at` to `messages` table');
            }
        } catch (e) {
            console.error('Failed to ensure delivered_at column:', e.message || e);
        }
        console.log('✅ Messages table initialized');

        // Create groups table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS \`groups\` (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                image VARCHAR(255),
                group_type ENUM('public', 'private', 'secret') DEFAULT 'public',
                created_by INT NOT NULL,
                disappearing_days INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id),
                INDEX idx_created_by (created_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Ensure group_type column exists (for existing databases)
        try {
            const [rows] = await pool.query(
                `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'groups' AND COLUMN_NAME = 'group_type'`
            );
            if (rows[0] && rows[0].count === 0) {
                await pool.query(
                    `ALTER TABLE \`groups\` ADD COLUMN group_type ENUM('public','private','secret') DEFAULT 'public' AFTER image`
                );
                console.log('ℹ️ Added missing column `group_type` to `groups` table');
            }
        } catch (e) {
            console.error('Failed to ensure group_type column:', e.message || e);
        }
        console.log('✅ Groups table initialized');

        // Create group_members table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_members (
                id INT PRIMARY KEY AUTO_INCREMENT,
                group_id INT NOT NULL,
                user_id INT NOT NULL,
                role ENUM('admin', 'moderator', 'member') DEFAULT 'member',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_member (group_id, user_id),
                INDEX idx_group_id (group_id),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Group members table initialized');

        // Create group_permissions table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_permissions (
                group_id INT PRIMARY KEY,
                edit_settings BOOLEAN DEFAULT FALSE,
                send_message BOOLEAN DEFAULT TRUE,
                add_members BOOLEAN DEFAULT FALSE,
                invite_link BOOLEAN DEFAULT FALSE,
                screenshot_block BOOLEAN DEFAULT FALSE,
                forward_block BOOLEAN DEFAULT FALSE,
                copy_paste_block BOOLEAN DEFAULT FALSE,
                watermark_docs BOOLEAN DEFAULT FALSE,
                admin_approval BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        // Create group_join_requests table (for admin approval flow)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_join_requests (
                id INT PRIMARY KEY AUTO_INCREMENT,
                group_id INT NOT NULL,
                user_id INT NOT NULL,
                status ENUM('pending','approved','rejected') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_group_id (group_id),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create group invite links table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_invite_links (
                id INT PRIMARY KEY AUTO_INCREMENT,
                group_id INT NOT NULL,
                token VARCHAR(255) NOT NULL UNIQUE,
                expires_at TIMESTAMP NULL,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_group_invite_group (group_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        console.log('✅ Group permissions table initialized');

        // Create files table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS files (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT,
                chat_id INT,
                group_id INT,
                message_id INT,
                file_type VARCHAR(50),
                file_path VARCHAR(255) NOT NULL,
                original_name VARCHAR(255),
                file_size INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_chat_id (chat_id),
                INDEX idx_group_id (group_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Files table initialized');

        // Create notifications table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255),
                message TEXT,
                data JSON,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_is_read (is_read)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Notifications table initialized');

        console.log('✅ All tables initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        throw error;
    }
};

module.exports = { pool, testConnection, initializeDatabase, queryWithRetry };
