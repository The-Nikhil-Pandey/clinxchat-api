const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

class UserService {

    /**
     * Check if email already exists in database
     * @param {string} email - User email
     * @returns {Promise<boolean>}
     */
    static async emailExists(email) {
        try {
            const [rows] = await pool.query(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );
            return rows.length > 0;
        } catch (error) {
            throw new Error(`Email check failed: ${error.message}`);
        }
    }

    /**
     * Hash password using bcrypt
     * @param {string} password - Plain text password
     * @returns {Promise<string>} - Hashed password
     */
    static async hashPassword(password) {
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(password, salt);
    }

    /**
     * Compare password with hashed password
     * @param {string} password - Plain text password
     * @param {string} hashedPassword - Hashed password from database
     * @returns {Promise<boolean>}
     */
    static async comparePassword(password, hashedPassword) {
        return await bcrypt.compare(password, hashedPassword);
    }

    /**
     * Register a new user
     * @param {Object} userData - User registration data
     * @returns {Promise<Object>} - Created user object
     */
    static async registerUser(userData) {
        const { firstName, lastName, email, password, phone } = userData;

        try {
            // Check if email already exists
            const emailAlreadyExists = await this.emailExists(email);
            if (emailAlreadyExists) {
                const error = new Error('Email already registered');
                error.statusCode = 400;
                throw error;
            }

            // Hash password
            const hashedPassword = await this.hashPassword(password);

            // Insert user into database
            const [result] = await pool.query(
                `INSERT INTO users (first_name, last_name, email, password, phone) 
                 VALUES (?, ?, ?, ?, ?)`,
                [firstName, lastName, email, hashedPassword, phone || null]
            );

            return {
                id: result.insertId,
                firstName,
                lastName,
                email,
                phone: phone || null
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Find user by email
     * @param {string} email - User email
     * @returns {Promise<Object|null>}
     */
    static async findByEmail(email) {
        try {
            const [rows] = await pool.query(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );
            return rows[0] || null;
        } catch (error) {
            throw new Error(`Find by email failed: ${error.message}`);
        }
    }

    /**
     * Find user by ID
     * @param {number} id - User ID
     * @returns {Promise<Object|null>}
     */
    static async findById(id) {
        try {
            const [rows] = await pool.query(
                'SELECT id, first_name, last_name, email, phone, created_at, is_active FROM users WHERE id = ?',
                [id]
            );
            return rows[0] || null;
        } catch (error) {
            throw new Error(`Find by ID failed: ${error.message}`);
        }
    }

    /**
     * Get all users
     * @returns {Promise<Array>}
     */
    static async getAllUsers() {
        try {
            const [rows] = await pool.query(
                'SELECT id, first_name, last_name, email, phone, created_at, is_active FROM users ORDER BY created_at DESC'
            );
            return rows;
        } catch (error) {
            throw new Error(`Get all users failed: ${error.message}`);
        }
    }

    /**
     * Update user by ID
     * @param {number} id - User ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<boolean>}
     */
    static async updateUser(id, updateData) {
        const { firstName, lastName, phone } = updateData;

        try {
            const [result] = await pool.query(
                `UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?`,
                [firstName, lastName, phone || null, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Update user failed: ${error.message}`);
        }
    }

    /**
     * Delete user by ID (soft delete - set is_active to false)
     * @param {number} id - User ID
     * @returns {Promise<boolean>}
     */
    static async deleteUser(id) {
        try {
            const [result] = await pool.query(
                'UPDATE users SET is_active = FALSE WHERE id = ?',
                [id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Delete user failed: ${error.message}`);
        }
    }
}

module.exports = UserService;
