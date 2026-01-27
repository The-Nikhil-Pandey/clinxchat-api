const { pool } = require('../config/db');

/**
 * Notification Model - Database operations for notifications
 */
class NotificationModel {

    /**
     * Create notification
     */
    static async create(notificationData) {
        const { userId, type, title, message, data } = notificationData;

        const [result] = await pool.query(
            `INSERT INTO notifications (user_id, type, title, message, data) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, type, title || null, message || null, JSON.stringify(data) || null]
        );

        return {
            id: result.insertId,
            ...notificationData,
            is_read: false,
            created_at: new Date()
        };
    }

    /**
     * Find notification by ID
     */
    static async findById(id) {
        const [rows] = await pool.query(
            'SELECT * FROM notifications WHERE id = ?',
            [id]
        );
        if (rows[0] && rows[0].data && typeof rows[0].data === 'string') {
            try {
                rows[0].data = JSON.parse(rows[0].data);
            } catch (e) {
                console.error('Failed to parse notification data:', e);
            }
        }

        return rows[0] || null;
    }

    /**
     * Get notifications for user
     */
    static async findByUserId(userId, limit = 50, offset = 0) {
        const [rows] = await pool.query(`
            SELECT * FROM notifications 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);

        return rows.map(row => {
            if (row.data && typeof row.data === 'string') {
                try {
                    row.data = JSON.parse(row.data);
                } catch (e) {
                    console.error('Failed to parse notification data:', e);
                }
            }
            return row;
        });

    }

    /**
     * Get unread count
     */
    static async getUnreadCount(userId) {
        const [rows] = await pool.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );
        return rows[0].count;
    }

    /**
     * Mark as read
     */
    static async markAsRead(id, userId) {
        const [result] = await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Mark all as read
     */
    static async markAllAsRead(userId) {
        const [result] = await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );
        return result.affectedRows;
    }

    /**
     * Delete notification
     */
    static async delete(id, userId) {
        const [result] = await pool.query(
            'DELETE FROM notifications WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Delete old notifications (cleanup)
     */
    static async deleteOld(daysOld = 30) {
        const [result] = await pool.query(
            'DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [daysOld]
        );
        return result.affectedRows;
    }
}

module.exports = NotificationModel;
