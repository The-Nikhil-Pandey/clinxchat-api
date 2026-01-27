const { pool } = require('../config/db');

/**
 * Channel Model - Database operations for team channels
 */
class ChannelModel {

    /**
     * Create a new channel
     */
    static async create(channelData) {
        const { teamId, name, description, type, createdBy, isDefault } = channelData;

        const [result] = await pool.query(
            `INSERT INTO channels (team_id, name, description, type, is_default, created_by) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [teamId, name, description || null, type || 'public', isDefault || false, createdBy]
        );

        const channelId = result.insertId;

        // Add creator as member
        if (createdBy) {
            await pool.query(
                `INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)`,
                [channelId, createdBy]
            );
        }

        return {
            id: channelId,
            team_id: teamId,
            name,
            description,
            type: type || 'public',
            is_default: isDefault || false,
            created_by: createdBy
        };
    }

    /**
     * Find channel by ID
     */
    static async findById(id) {
        const [rows] = await pool.query(
            `SELECT c.*, 
                    (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count,
                    u.name as created_by_name
             FROM channels c
             LEFT JOIN users u ON c.created_by = u.id
             WHERE c.id = ? AND c.deleted_at IS NULL`,
            [id]
        );
        return rows[0] || null;
    }

    /**
     * Get all channels for a team
     */
    static async findByTeamId(teamId, userId = null) {
        let sql = `
            SELECT c.*, 
                   (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count
        `;

        if (userId) {
            sql += `, (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id AND user_id = ?) as is_member`;
        }

        sql += `
            FROM channels c
            WHERE c.team_id = ? AND c.deleted_at IS NULL AND c.is_archived = FALSE
            ORDER BY c.is_default DESC, c.name ASC
        `;

        const params = userId ? [userId, teamId] : [teamId];
        const [rows] = await pool.query(sql, params);

        if (userId) {
            return rows.map(row => ({
                ...row,
                is_member: row.is_member > 0
            }));
        }

        return rows;
    }

    /**
     * Get channels user is member of
     */
    static async findByUserId(userId, teamId) {
        const [rows] = await pool.query(
            `SELECT c.*, 
                    (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count,
                    cm.is_muted, cm.last_read_at,
                    (SELECT COUNT(*) FROM messages m 
                     WHERE m.channel_id = c.id 
                     AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01')
                     AND m.sender_id != ?) as unread_count
             FROM channels c
             JOIN channel_members cm ON c.id = cm.channel_id
             WHERE cm.user_id = ? AND c.team_id = ? AND c.deleted_at IS NULL AND c.is_archived = FALSE
             ORDER BY c.is_default DESC, c.name ASC`,
            [userId, userId, teamId]
        );
        return rows;
    }

    /**
     * Update channel
     */
    static async update(id, updateData) {
        const { name, description, type, isArchived } = updateData;
        let sql = 'UPDATE channels SET ';
        const updates = [];
        const params = [];

        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
        }
        if (type !== undefined) {
            updates.push('type = ?');
            params.push(type);
        }
        if (isArchived !== undefined) {
            updates.push('is_archived = ?');
            params.push(isArchived);
        }

        if (updates.length === 0) return false;

        sql += updates.join(', ') + ' WHERE id = ?';
        params.push(id);

        const [result] = await pool.query(sql, params);
        return result.affectedRows > 0;
    }

    /**
     * Soft delete channel
     */
    static async softDelete(id) {
        const [result] = await pool.query(
            `UPDATE channels SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND is_default = FALSE`,
            [id]
        );
        return result.affectedRows > 0;
    }

    /**
     * Get channel members
     */
    static async getMembers(channelId) {
        const [rows] = await pool.query(
            `SELECT u.id, u.name, u.email, u.profile_picture, u.active_status,
                    cm.joined_at, cm.is_muted
             FROM channel_members cm
             JOIN users u ON cm.user_id = u.id
             WHERE cm.channel_id = ? AND u.is_active = TRUE
             ORDER BY u.name ASC`,
            [channelId]
        );
        return rows;
    }

    /**
     * Add member to channel
     */
    static async addMember(channelId, userId) {
        try {
            await pool.query(
                `INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE joined_at = CURRENT_TIMESTAMP`,
                [channelId, userId]
            );
            return true;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return true; // Already a member
            }
            throw error;
        }
    }

    /**
     * Remove member from channel
     */
    static async removeMember(channelId, userId) {
        const [result] = await pool.query(
            `DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?`,
            [channelId, userId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Check if user is member
     */
    static async isMember(channelId, userId) {
        const [rows] = await pool.query(
            `SELECT id FROM channel_members WHERE channel_id = ? AND user_id = ?`,
            [channelId, userId]
        );
        return rows.length > 0;
    }

    /**
     * Get team ID for channel
     */
    static async getTeamId(channelId) {
        const [rows] = await pool.query(
            `SELECT team_id FROM channels WHERE id = ?`,
            [channelId]
        );
        return rows[0]?.team_id || null;
    }

    /**
     * Update last read timestamp
     */
    static async updateLastRead(channelId, userId) {
        await pool.query(
            `UPDATE channel_members SET last_read_at = CURRENT_TIMESTAMP 
             WHERE channel_id = ? AND user_id = ?`,
            [channelId, userId]
        );
    }

    /**
     * Toggle mute
     */
    static async toggleMute(channelId, userId, muted) {
        await pool.query(
            `UPDATE channel_members SET is_muted = ? WHERE channel_id = ? AND user_id = ?`,
            [muted, channelId, userId]
        );
    }

    /**
     * Create default channels for a team
     */
    static async createDefaults(teamId, createdBy) {
        const defaults = [
            { name: 'general', description: 'General discussion' },
            { name: 'announcements', description: 'Team announcements' }
        ];

        const channels = [];
        for (const def of defaults) {
            const channel = await this.create({
                teamId,
                name: def.name,
                description: def.description,
                isDefault: true,
                createdBy
            });
            channels.push(channel);
        }

        return channels;
    }
}

module.exports = ChannelModel;
