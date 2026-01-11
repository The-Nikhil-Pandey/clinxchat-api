const { pool } = require('../config/db');

/**
 * Message Model - Database operations for messages
 */
class MessageModel {

    /**
     * Create a new message
     */
    static async create(messageData) {
        const { chatId, senderId, messageType, content, filePath, duration } = messageData;

        const [result] = await pool.query(
            `INSERT INTO messages (chat_id, sender_id, message_type, content, file_path, duration) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [chatId, senderId, messageType || 'text', content || null, filePath || null, duration || null]
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
    static async findByChatId(chatId, limit = 50, offset = 0) {
        const [rows] = await pool.query(`
            SELECT m.*, u.name as sender_name, u.profile_picture as sender_picture
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = ?
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?
        `, [chatId, limit, offset]);
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
     * Delete message
     */
    static async delete(id, userId) {
        const [result] = await pool.query(
            'DELETE FROM messages WHERE id = ? AND sender_id = ?',
            [id, userId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Get media messages for a chat
     */
    static async getMediaByChatId(chatId, type = null) {
        let sql = `
            SELECT m.*, u.name as sender_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = ? AND m.message_type != 'text'
        `;
        const params = [chatId];

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
}

module.exports = MessageModel;
