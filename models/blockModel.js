const { pool } = require('../config/db');

/**
 * Block Model - Database operations for user blocking
 */
class BlockModel {
    /**
     * Block a user
     */
    static async block(blockerId, blockedId) {
        const [result] = await pool.query(
            `INSERT INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE id = id`,
            [blockerId, blockedId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Unblock a user
     */
    static async unblock(blockerId, blockedId) {
        const [result] = await pool.query(
            `DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?`,
            [blockerId, blockedId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Check if either user has blocked the other
     * Returns: { isBlocked: boolean, blockedBy: 'me' | 'them' | null }
     */
    static async getBlockStatus(userId1, userId2) {
        const [rows] = await pool.query(
            `SELECT blocker_id, blocked_id FROM blocked_users 
             WHERE (blocker_id = ? AND blocked_id = ?) 
             OR (blocker_id = ? AND blocked_id = ?)`,
            [userId1, userId2, userId2, userId1]
        );

        if (rows.length === 0) {
            return { isBlocked: false, blockedBy: null };
        }

        const block = rows[0];
        if (block.blocker_id === userId1) {
            return { isBlocked: true, blockedBy: 'me' };
        } else {
            return { isBlocked: true, blockedBy: 'them' };
        }
    }

    /**
     * Check if a specific user has blocked another
     */
    static async hasBlocked(blockerId, blockedId) {
        const [rows] = await pool.query(
            `SELECT id FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?`,
            [blockerId, blockedId]
        );
        return rows.length > 0;
    }

    /**
     * Get all users blocked by a specific user
     */
    static async getBlockedByUser(userId) {
        const [rows] = await pool.query(
            `SELECT bu.*, u.id as user_id, u.name, u.email, u.profile_picture, u.active_status
             FROM blocked_users bu
             JOIN users u ON bu.blocked_id = u.id
             WHERE bu.blocker_id = ?
             ORDER BY bu.created_at DESC`,
            [userId]
        );
        return rows;
    }

    /**
     * Get blocked user IDs for filtering chats
     */
    static async getBlockedUserIds(userId) {
        const [rows] = await pool.query(
            `SELECT blocked_id FROM blocked_users WHERE blocker_id = ?`,
            [userId]
        );
        return rows.map(r => r.blocked_id);
    }
}

module.exports = BlockModel;
