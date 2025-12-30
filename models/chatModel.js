const { pool } = require('../config/db');

/**
 * Chat Model - Database operations for chats
 */
class ChatModel {

    /**
     * Create a new private chat
     */
    static async createPrivateChat(user1Id, user2Id) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Create chat
            const [chatResult] = await connection.query(
                'INSERT INTO chats (type) VALUES (?)',
                ['private']
            );
            const chatId = chatResult.insertId;

            // Add participants
            await connection.query(
                'INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?), (?, ?)',
                [chatId, user1Id, chatId, user2Id]
            );

            await connection.commit();
            return chatId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Find existing private chat between two users
     */
    static async findPrivateChat(user1Id, user2Id) {
        const [rows] = await pool.query(`
            SELECT c.id 
            FROM chats c
            JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ?
            JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ?
            WHERE c.type = 'private'
            LIMIT 1
        `, [user1Id, user2Id]);
        return rows[0] || null;
    }

    /**
     * Get or create private chat
     */
    static async getOrCreatePrivateChat(user1Id, user2Id) {
        const existing = await this.findPrivateChat(user1Id, user2Id);
        if (existing) {
            return existing.id;
        }
        return await this.createPrivateChat(user1Id, user2Id);
    }

    /**
     * Find chat by ID
     */
    static async findById(chatId) {
        const [rows] = await pool.query(
            'SELECT * FROM chats WHERE id = ?',
            [chatId]
        );
        return rows[0] || null;
    }

    /**
     * Get chat participants
     */
    static async getParticipants(chatId) {
        const [rows] = await pool.query(`
            SELECT u.id, u.name, u.email, u.profile_picture, u.active_status
            FROM chat_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.chat_id = ?
        `, [chatId]);
        return rows;
    }

    /**
     * Check if user is participant
     */
    static async isParticipant(chatId, userId) {
        const [rows] = await pool.query(
            'SELECT id FROM chat_participants WHERE chat_id = ? AND user_id = ?',
            [chatId, userId]
        );
        return rows.length > 0;
    }

    /**
     * Get all chats for a user with last message
     */
    static async findByUserId(userId) {
        const [rows] = await pool.query(`
            SELECT 
                c.id,
                c.type,
                c.group_id,
                c.created_at,
                (
                    SELECT JSON_OBJECT(
                        'id', m.id,
                        'content', m.content,
                        'message_type', m.message_type,
                        'sender_id', m.sender_id,
                        'created_at', m.created_at
                    )
                    FROM messages m 
                    WHERE m.chat_id = c.id 
                    ORDER BY m.created_at DESC 
                    LIMIT 1
                ) as last_message,
                (
                    SELECT COUNT(*) 
                    FROM messages m 
                    WHERE m.chat_id = c.id 
                    AND m.sender_id != ? 
                    AND m.seen_at IS NULL
                ) as unread_count
            FROM chats c
            JOIN chat_participants cp ON c.id = cp.chat_id
            WHERE cp.user_id = ?
            ORDER BY (
                SELECT MAX(m.created_at) 
                FROM messages m 
                WHERE m.chat_id = c.id
            ) DESC
        `, [userId, userId]);

        // Get participant info for private chats
        for (let chat of rows) {
            if (chat.type === 'private') {
                const [participants] = await pool.query(`
                    SELECT u.id, u.name, u.email, u.profile_picture, u.active_status
                    FROM chat_participants cp
                    JOIN users u ON cp.user_id = u.id
                    WHERE cp.chat_id = ? AND u.id != ?
                `, [chat.id, userId]);
                chat.participant = participants[0] || null;
            }
            if (chat.last_message) {
                // Only parse if it's a string, not already an object
                if (typeof chat.last_message === 'string') {
                    try {
                        chat.last_message = JSON.parse(chat.last_message);
                    } catch (e) {
                        console.error('Failed to parse last_message:', e);
                        chat.last_message = null;
                    }
                }
            }
        }

        return rows;
    }

    /**
     * Create group chat
     */
    static async createGroupChat(groupId) {
        const [result] = await pool.query(
            'INSERT INTO chats (type, group_id) VALUES (?, ?)',
            ['group', groupId]
        );
        return result.insertId;
    }

    /**
     * Find chat by group ID
     */
    static async findByGroupId(groupId) {
        const [rows] = await pool.query(
            'SELECT * FROM chats WHERE group_id = ? AND type = "group"',
            [groupId]
        );
        return rows[0] || null;
    }
}

module.exports = ChatModel;
