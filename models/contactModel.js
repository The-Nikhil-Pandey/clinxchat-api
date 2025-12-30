const { pool } = require('../config/db');

/**
 * Contact Model - Database operations for contacts
 */
class ContactModel {

    /**
     * Add a contact
     */
    static async add(userId, contactUserId) {
        const [result] = await pool.query(
            'INSERT INTO contacts (user_id, contact_user_id) VALUES (?, ?)',
            [userId, contactUserId]
        );
        return result.insertId;
    }

    /**
     * Remove a contact
     */
    static async remove(userId, contactUserId) {
        const [result] = await pool.query(
            'DELETE FROM contacts WHERE user_id = ? AND contact_user_id = ?',
            [userId, contactUserId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Check if contact exists
     */
    static async exists(userId, contactUserId) {
        const [rows] = await pool.query(
            'SELECT id FROM contacts WHERE user_id = ? AND contact_user_id = ?',
            [userId, contactUserId]
        );
        return rows.length > 0;
    }

    /**
     * Get all contacts of a user
     */
    static async findByUserId(userId) {
        const [rows] = await pool.query(`
            SELECT 
                c.id as contact_id,
                u.id, u.name, u.email, u.role, u.department,
                u.profile_picture, u.active_status
            FROM contacts c
            JOIN users u ON c.contact_user_id = u.id
            WHERE c.user_id = ? AND u.is_active = TRUE
            ORDER BY u.name ASC
        `, [userId]);
        return rows;
    }

    /**
     * Search contacts
     */
    static async search(userId, query) {
        const [rows] = await pool.query(`
            SELECT 
                c.id as contact_id,
                u.id, u.name, u.email, u.role, u.department,
                u.profile_picture, u.active_status
            FROM contacts c
            JOIN users u ON c.contact_user_id = u.id
            WHERE c.user_id = ? 
            AND u.is_active = TRUE
            AND (u.name LIKE ? OR u.email LIKE ?)
            ORDER BY u.name ASC
            LIMIT 50
        `, [userId, `%${query}%`, `%${query}%`]);
        return rows;
    }
}

module.exports = ContactModel;
