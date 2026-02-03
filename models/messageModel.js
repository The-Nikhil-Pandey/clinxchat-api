const { pool } = require('../config/db');

/**
 * Message Model - Database operations for messages
 */
class MessageModel {

    /**
     * Create a new message
     */
    static async create(messageData) {
        const { chatId, senderId, messageType, content, filePath, duration, metadata } = messageData;

        const [result] = await pool.query(
            `INSERT INTO messages (chat_id, sender_id, message_type, content, file_path, duration, metadata) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [chatId, senderId, messageType || 'text', content || null, filePath || null, duration || null, metadata ? JSON.stringify(metadata) : null]
        );

        return await this.findById(result.insertId);
    }

    /**
     * Find message by ID
     */
    static async findById(id) {
        const [rows] = await pool.query(`
            SELECT m.*, u.name as sender_name, u.profile_picture as sender_picture
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.id = ?
        `, [id]);
        return rows[0] || null;
    }

    /**
     * Get messages for a chat with pagination
     */
    static async findByChatId(chatId, userId, limit = 50, offset = 0, exitedAt = null) {
        const [rows] = await pool.query(`
            SELECT m.*, u.name as sender_name, u.profile_picture as sender_picture
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = ? 
            AND m.is_deleted_everyone = FALSE
            AND NOT JSON_CONTAINS(COALESCE(m.deleted_for_users, '[]'), CAST(? AS JSON))
            AND (m.created_at <= ? OR ? IS NULL)
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?
        `, [chatId, userId, exitedAt, exitedAt, limit, offset]);
        return rows.reverse(); // Return in chronological order
    }

    /**
     * Mark messages as seen
     */
    static async markAsSeen(chatId, userId) {
        const [result] = await pool.query(
            `UPDATE messages 
             SET seen_at = CURRENT_TIMESTAMP 
             WHERE chat_id = ? AND sender_id != ? AND seen_at IS NULL`,
            [chatId, userId]
        );
        return result.affectedRows;
    }

    static async setDelivered(messageId) {
        const [result] = await pool.query(
            `UPDATE messages SET delivered_at = CURRENT_TIMESTAMP WHERE id = ? AND delivered_at IS NULL`,
            [messageId]
        );
        return result.affectedRows;
    }

    /**
     * Get unread count for user in a chat
     */
    static async getUnreadCount(chatId, userId) {
        const [rows] = await pool.query(
            `SELECT COUNT(*) as count 
             FROM messages 
             WHERE chat_id = ? AND sender_id != ? AND seen_at IS NULL`,
            [chatId, userId]
        );
        return rows[0].count;
    }

    /**
     * Delete message for everyone
     */
    static async deleteForEveryone(id, userId) {
        const [result] = await pool.query(
            `UPDATE messages 
             SET is_deleted_everyone = TRUE, content = NULL, file_path = NULL 
             WHERE id = ? AND sender_id = ?`,
            [id, userId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Delete message for me
     */
    static async deleteForMe(id, userId) {
        const [result] = await pool.query(
            `UPDATE messages 
             SET deleted_for_users = JSON_ARRAY_APPEND(COALESCE(deleted_for_users, '[]'), '$', ?) 
             WHERE id = ? AND NOT JSON_CONTAINS(COALESCE(deleted_for_users, '[]'), CAST(? AS JSON))`,
            [userId, id, userId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Delete multiple messages for everyone
     */
    static async deleteBulkForEveryone(ids, userId) {
        if (!ids || ids.length === 0) return 0;
        const [result] = await pool.query(
            `UPDATE messages 
             SET is_deleted_everyone = TRUE, content = NULL, file_path = NULL 
             WHERE id IN (?) AND sender_id = ?`,
            [ids, userId]
        );
        return result.affectedRows;
    }

    /**
     * Delete multiple messages for me
     */
    static async deleteBulkForMe(ids, userId) {
        if (!ids || ids.length === 0) return 0;

        // We'll update each one where not already deleted for this user
        // Using a transaction for bulk operation safety
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            let totalAffected = 0;
            for (const id of ids) {
                const [result] = await connection.query(
                    `UPDATE messages 
                     SET deleted_for_users = JSON_ARRAY_APPEND(COALESCE(deleted_for_users, '[]'), '$', ?) 
                     WHERE id = ? AND NOT JSON_CONTAINS(COALESCE(deleted_for_users, '[]'), CAST(? AS JSON))`,
                    [userId, id, userId]
                );
                totalAffected += result.affectedRows;
            }
            await connection.commit();
            return totalAffected;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Clear chat history for me
     */
    static async clearChat(chatId, userId) {
        const [result] = await pool.query(
            `UPDATE messages 
             SET deleted_for_users = JSON_ARRAY_APPEND(COALESCE(deleted_for_users, '[]'), '$', ?) 
             WHERE chat_id = ? AND NOT JSON_CONTAINS(COALESCE(deleted_for_users, '[]'), CAST(? AS JSON))`,
            [userId, chatId, userId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Get media messages for a chat
     */
    static async getMediaByChatId(chatId, type = null, exitedAt = null) {
        let sql = `
            SELECT m.*, u.name as sender_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = ? AND m.message_type != 'text'
            AND (m.created_at <= ? OR ? IS NULL)
        `;
        const params = [chatId, exitedAt, exitedAt];

        if (type) {
            sql += ' AND m.message_type = ?';
            params.push(type);
        }

        sql += ' ORDER BY m.created_at DESC';

        const [rows] = await pool.query(sql, params);
        return rows;
    }

    /**
     * Get last message for a chat
     */
    static async getLastMessage(chatId) {
        const [rows] = await pool.query(`
            SELECT m.*, u.name as sender_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = ?
            ORDER BY m.created_at DESC
            LIMIT 1
        `, [chatId]);
        return rows[0] || null;
    }

    /**
     * Search messages in a chat
     */
    static async findByQuery(chatId, userId, query) {
        const [rows] = await pool.query(`
            SELECT m.*, u.name as sender_name, u.profile_picture as sender_picture
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = ? 
            AND m.is_deleted_everyone = FALSE
            AND NOT JSON_CONTAINS(COALESCE(m.deleted_for_users, '[]'), CAST(? AS JSON))
            AND (m.content LIKE ? OR m.file_path LIKE ?)
            ORDER BY m.created_at DESC
            LIMIT 100
        `, [chatId, userId, `%${query}%`, `%${query}%`]);
        return rows;
    }
}

module.exports = MessageModel;
