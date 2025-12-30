const { pool } = require('../config/db');

/**
 * File Model - Database operations for file metadata
 */
class FileModel {

    /**
     * Create file record
     */
    static async create(fileData) {
        const { userId, chatId, groupId, messageId, fileType, filePath, originalName, fileSize } = fileData;

        const [result] = await pool.query(
            `INSERT INTO files (user_id, chat_id, group_id, message_id, file_type, file_path, original_name, file_size) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId || null, chatId || null, groupId || null, messageId || null,
                fileType, filePath, originalName || null, fileSize || null]
        );

        return {
            id: result.insertId,
            ...fileData
        };
    }

    /**
     * Find file by ID
     */
    static async findById(id) {
        const [rows] = await pool.query(
            'SELECT * FROM files WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    }

    /**
     * Get files by chat ID
     */
    static async findByChatId(chatId, fileType = null) {
        let sql = 'SELECT * FROM files WHERE chat_id = ?';
        const params = [chatId];

        if (fileType) {
            sql += ' AND file_type = ?';
            params.push(fileType);
        }

        sql += ' ORDER BY created_at DESC';

        const [rows] = await pool.query(sql, params);
        return rows;
    }

    /**
     * Get files by group ID
     */
    static async findByGroupId(groupId, fileType = null) {
        let sql = 'SELECT * FROM files WHERE group_id = ?';
        const params = [groupId];

        if (fileType) {
            sql += ' AND file_type = ?';
            params.push(fileType);
        }

        sql += ' ORDER BY created_at DESC';

        const [rows] = await pool.query(sql, params);
        return rows;
    }

    /**
     * Get files by user ID
     */
    static async findByUserId(userId) {
        const [rows] = await pool.query(
            'SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows;
    }

    /**
     * Delete file record
     */
    static async delete(id) {
        const [result] = await pool.query(
            'DELETE FROM files WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }
}

module.exports = FileModel;
