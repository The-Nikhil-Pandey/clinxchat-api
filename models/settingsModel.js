const { pool } = require('../config/db');

/**
 * Settings Model - Database operations for user settings
 */
class SettingsModel {

    /**
     * Initialize settings table
     */
    static async initTable() {
        await pool.query(`
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ User settings table initialized');
    }

    /**
     * Get user settings by user ID
     * Creates default settings if not exists
     */
    static async getByUserId(userId) {
        let [rows] = await pool.query(
            'SELECT * FROM user_settings WHERE user_id = ?',
            [userId]
        );

        // If no settings exist, create default settings
        if (rows.length === 0) {
            await this.createDefault(userId);
            [rows] = await pool.query(
                'SELECT * FROM user_settings WHERE user_id = ?',
                [userId]
            );
        }

        return rows[0] || null;
    }

    /**
     * Create default settings for a user
     */
    static async createDefault(userId) {
        try {
            await pool.query(
                'INSERT INTO user_settings (user_id) VALUES (?)',
                [userId]
            );
            return true;
        } catch (error) {
            // Ignore duplicate key error (settings already exist)
            if (error.code !== 'ER_DUP_ENTRY') {
                throw error;
            }
            return false;
        }
    }

    /**
     * Update user settings
     */
    static async update(userId, settings) {
        const allowedFields = [
            'language', 'theme', 'font_size', 'notification_sound', 'desktop_notifications',
            'delay_send', 'delay_send_seconds', 'read_receipts', 'enter_key_behavior',
            'auto_download_media', 'link_preview', 'session_timeout', 'auto_logout',
            'biometric_auth', 'auto_archive', 'auto_archive_days', 'auto_purge_period'
        ];

        const updates = [];
        const params = [];

        for (const field of allowedFields) {
            if (settings[field] !== undefined) {
                updates.push(`${field} = ?`);
                params.push(settings[field]);
            }
        }

        if (updates.length === 0) {
            return await this.getByUserId(userId);
        }

        // First ensure settings exist
        await this.createDefault(userId);

        // Then update
        const sql = `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`;
        params.push(userId);

        await pool.query(sql, params);

        return await this.getByUserId(userId);
    }

    /**
     * Delete user settings (called when user is deleted)
     */
    static async delete(userId) {
        const [result] = await pool.query(
            'DELETE FROM user_settings WHERE user_id = ?',
            [userId]
        );
        return result.affectedRows > 0;
    }
}

module.exports = SettingsModel;
