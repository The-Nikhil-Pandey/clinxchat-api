const { pool } = require('../config/db');

/**
 * User Model - Database schema and direct queries only
 * Business logic is in services/userService.js
 */
class UserModel {

    /**
     * Check if email already exists
     * @param {string} email 
     * @returns {Promise<boolean>}
     */
    static async emailExists(email) {
        const [rows] = await pool.query(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        return rows.length > 0;
    }

    /**
     * Create a new user in database
     * @param {Object} userData 
     * @returns {Promise<Object>}
     */
    static async create(userData) {
        const { firstName, lastName, email, hashedPassword, phone } = userData;

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
            phone
        };
    }

    /**
     * Find user by email
     * @param {string} email 
     * @returns {Promise<Object|null>}
     */
    static async findByEmail(email) {
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        return rows[0] || null;
    }

    /**
     * Find user by ID (excludes password)
     * @param {number} id 
     * @returns {Promise<Object|null>}
     */
    static async findById(id) {
        const [rows] = await pool.query(
            'SELECT id, first_name, last_name, email, phone, created_at, is_active FROM users WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    }

    /**
     * Get all users (excludes password)
     * @returns {Promise<Array>}
     */
    static async findAll() {
        const [rows] = await pool.query(
            'SELECT id, first_name, last_name, email, phone, created_at, is_active FROM users ORDER BY created_at DESC'
        );
        return rows;
    }

    /**
     * Update user by ID
     * @param {number} id 
     * @param {Object} updateData 
     * @returns {Promise<boolean>}
     */
    static async update(id, updateData) {
        const { firstName, lastName, phone } = updateData;

        const [result] = await pool.query(
            `UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?`,
            [firstName, lastName, phone || null, id]
        );
        return result.affectedRows > 0;
    }

    /**
     * Soft delete user by ID
     * @param {number} id 
     * @returns {Promise<boolean>}
     */
    static async softDelete(id) {
        const [result] = await pool.query(
            'UPDATE users SET is_active = FALSE WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }
}

module.exports = UserModel;
