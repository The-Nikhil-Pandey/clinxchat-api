const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

class AuthService {

    /**
     * Login user and generate JWT token
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<Object>} - User data with token
     */
    static async login(email, password) {
        try {
            // Find user by email
            const [rows] = await pool.query(
                'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
                [email]
            );

            const user = rows[0];

            if (!user) {
                const error = new Error('Invalid email or password');
                error.statusCode = 401;
                throw error;
            }

            // Compare password
            const isPasswordValid = await bcrypt.compare(password, user.password);

            if (!isPasswordValid) {
                const error = new Error('Invalid email or password');
                error.statusCode = 401;
                throw error;
            }

            // Generate JWT token
            const token = this.generateToken({
                id: user.id,
                email: user.email
            });

            return {
                user: {
                    id: user.id,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    email: user.email,
                    phone: user.phone
                },
                token
            };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Generate JWT token
     * @param {Object} payload - Token payload
     * @returns {string} - JWT token
     */
    static generateToken(payload) {
        return jwt.sign(
            payload,
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
    }

    /**
     * Verify JWT token
     * @param {string} token - JWT token
     * @returns {Object} - Decoded token payload
     */
    static verifyToken(token) {
        try {
            return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        } catch (error) {
            const err = new Error('Invalid or expired token');
            err.statusCode = 401;
            throw err;
        }
    }

    /**
     * Change user password
     * @param {number} userId - User ID
     * @param {string} currentPassword - Current password
     * @param {string} newPassword - New password
     * @returns {Promise<boolean>}
     */
    static async changePassword(userId, currentPassword, newPassword) {
        try {
            // Get user with password
            const [rows] = await pool.query(
                'SELECT password FROM users WHERE id = ? AND is_active = TRUE',
                [userId]
            );

            const user = rows[0];

            if (!user) {
                const error = new Error('User not found');
                error.statusCode = 404;
                throw error;
            }

            // Verify current password
            const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

            if (!isPasswordValid) {
                const error = new Error('Current password is incorrect');
                error.statusCode = 400;
                throw error;
            }

            // Hash new password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            // Update password
            await pool.query(
                'UPDATE users SET password = ? WHERE id = ?',
                [hashedPassword, userId]
            );

            return true;

        } catch (error) {
            throw error;
        }
    }
}

module.exports = AuthService;
