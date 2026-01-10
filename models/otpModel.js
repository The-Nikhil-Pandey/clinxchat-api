const { pool } = require('../config/db');

/**
 * OTP Model - Database operations for OTP verification
 */
class OtpModel {

    /**
     * Initialize OTP table
     */
    static async initialize() {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS otps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                otp_code VARCHAR(10) NOT NULL,
                attempts INT DEFAULT 0,
                max_attempts INT DEFAULT 3,
                expires_at DATETIME NOT NULL,
                verified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_email (email),
                INDEX idx_expires (expires_at)
            )
        `;
        await pool.query(createTableSQL);
        console.log('✅ OTPs table initialized');
    }

    /**
     * Create new OTP record
     * @param {string} email - User email
     * @param {string} otpCode - Generated OTP
     * @param {number} expiresInMinutes - Expiry time in minutes (default 5)
     */
    static async create(email, otpCode, expiresInMinutes = 5) {
        // Delete any existing OTPs for this email
        await pool.query('DELETE FROM otps WHERE email = ?', [email]);

        // Create new OTP with expiry
        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

        const [result] = await pool.query(
            `INSERT INTO otps (email, otp_code, expires_at) VALUES (?, ?, ?)`,
            [email, otpCode, expiresAt]
        );

        return {
            id: result.insertId,
            email,
            expiresAt
        };
    }

    /**
     * Verify OTP
     * @param {string} email - User email
     * @param {string} otpCode - OTP to verify
     * @returns {Object} - { valid: boolean, message: string }
     */
    static async verify(email, otpCode) {
        // Get OTP record
        const [rows] = await pool.query(
            `SELECT * FROM otps WHERE email = ? AND verified = FALSE ORDER BY created_at DESC LIMIT 1`,
            [email]
        );

        if (rows.length === 0) {
            return { valid: false, message: 'No OTP found. Please request a new one.' };
        }

        const otp = rows[0];

        // Check if expired
        if (new Date() > new Date(otp.expires_at)) {
            await pool.query('DELETE FROM otps WHERE id = ?', [otp.id]);
            return { valid: false, message: 'OTP has expired. Please request a new one.' };
        }

        // Check attempts
        if (otp.attempts >= otp.max_attempts) {
            await pool.query('DELETE FROM otps WHERE id = ?', [otp.id]);
            return { valid: false, message: 'Maximum attempts exceeded. Please request a new OTP.' };
        }

        // Increment attempts
        await pool.query('UPDATE otps SET attempts = attempts + 1 WHERE id = ?', [otp.id]);

        // Verify OTP
        if (otp.otp_code !== otpCode) {
            const remainingAttempts = otp.max_attempts - otp.attempts - 1;
            return {
                valid: false,
                message: `Invalid OTP. ${remainingAttempts} attempt(s) remaining.`
            };
        }

        // Mark as verified
        await pool.query('UPDATE otps SET verified = TRUE WHERE id = ?', [otp.id]);

        return { valid: true, message: 'OTP verified successfully.' };
    }

    /**
     * Delete OTP records for email
     */
    static async deleteByEmail(email) {
        await pool.query('DELETE FROM otps WHERE email = ?', [email]);
    }

    /**
     * Clean up expired OTPs
     */
    static async cleanupExpired() {
        await pool.query('DELETE FROM otps WHERE expires_at < NOW()');
    }
}

module.exports = OtpModel;
