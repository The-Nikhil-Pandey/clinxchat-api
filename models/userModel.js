const { pool } = require('../config/db');

/**
 * User Model - Database operations for users
 */
class UserModel {

    /**
     * Check if email already exists
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
     */
    static async create(userData) {
        const { name, email, hashedPassword, role, department } = userData;

        const [result] = await pool.query(
            `INSERT INTO users (name, email, password, role, department) 
             VALUES (?, ?, ?, ?, ?)`,
            [name, email, hashedPassword, role || 'clinical_staff', department || null]
        );

        return {
            id: result.insertId,
            name,
            email,
            role: role || 'clinical_staff',
            department
        };
    }

    /**
     * Find user by email (includes password for auth)
     */
    static async findByEmail(email) {
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
            [email]
        );
        return rows[0] || null;
    }

    /**
     * Find user by ID (excludes password)
     */
    static async findById(id) {
        const [rows] = await pool.query(
            `SELECT id, name, email, role, department, profile_picture, 
                    active_status, is_active, created_at, updated_at 
             FROM users WHERE id = ?`,
            [id]
        );
        return rows[0] || null;
    }

    /**
     * Get all active users (excludes password)
     */
    static async findAll() {
        const [rows] = await pool.query(
            `SELECT id, name, email, role, department, profile_picture, 
                    active_status, created_at 
             FROM users WHERE is_active = TRUE 
             ORDER BY name ASC`
        );
        return rows;
    }

    /**
     * Search users by name or email
     */
    static async search(query, excludeUserId = null) {
        let sql = `
            SELECT id, name, email, role, department, profile_picture, active_status 
            FROM users 
            WHERE is_active = TRUE 
            AND (name LIKE ? OR email LIKE ?)
        `;
        const params = [`%${query}%`, `%${query}%`];

        if (excludeUserId) {
            sql += ' AND id != ?';
            params.push(excludeUserId);
        }

        sql += ' ORDER BY name ASC LIMIT 50';

        const [rows] = await pool.query(sql, params);
        return rows;
    }

    /**
     * Update user profile
     */
    static async update(id, updateData) {
        const { name, department, profile_picture } = updateData;

        let sql = 'UPDATE users SET ';
        const updates = [];
        const params = [];

        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (department !== undefined) {
            updates.push('department = ?');
            params.push(department);
        }
        if (profile_picture !== undefined) {
            updates.push('profile_picture = ?');
            params.push(profile_picture);
        }

        if (updates.length === 0) return false;

        sql += updates.join(', ') + ' WHERE id = ?';
        params.push(id);

        const [result] = await pool.query(sql, params);
        return result.affectedRows > 0;
    }

    /**
     * Update user active status
     */
    static async updateStatus(id, status) {
        const [result] = await pool.query(
            'UPDATE users SET active_status = ? WHERE id = ?',
            [status, id]
        );
        return result.affectedRows > 0;
    }

    /**
     * Update password
     */
    static async updatePassword(id, hashedPassword) {
        const [result] = await pool.query(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, id]
        );
        return result.affectedRows > 0;
    }

    /**
     * Soft delete user
     */
    static async softDelete(id) {
        const [result] = await pool.query(
            'UPDATE users SET is_active = FALSE WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }

    /**
     * Get user with password (for auth only)
     */
    static async findByIdWithPassword(id) {
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE id = ? AND is_active = TRUE',
            [id]
        );
        return rows[0] || null;
    }
}

module.exports = UserModel;
