const { pool } = require('../config/db');

/**
 * Group Model - Database operations for groups
 */
class GroupModel {

    /**
     * Create a new group
     */
    static async create(groupData) {
        const { name, description, image, createdBy, disappearingDays, groupType } = groupData;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Create group
            const [groupResult] = await connection.query(
                `INSERT INTO \`groups\` (name, description, image, group_type, created_by, disappearing_days) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [name, description || null, image || null, groupType || 'public', createdBy, disappearingDays || 0]
            );
            const groupId = groupResult.insertId;

            // Add creator as admin
            await connection.query(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
                [groupId, createdBy, 'admin']
            );

            // Create default permissions
            await connection.query(
                'INSERT INTO group_permissions (group_id) VALUES (?)',
                [groupId]
            );

            await connection.commit();
            return await this.findById(groupId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Find group by ID
     */
    static async findById(id) {
        const [rows] = await pool.query(`
            SELECT g.*, u.name as creator_name
            FROM \`groups\` g
            JOIN users u ON g.created_by = u.id
            WHERE g.id = ?
        `, [id]);
        return rows[0] || null;
    }

    /**
     * Update group
     */
    static async update(id, updateData) {
        const { name, description, image, disappearingDays } = updateData;

        let sql = 'UPDATE `groups` SET ';
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
        if (image !== undefined) {
            updates.push('image = ?');
            params.push(image);
        }
        if (disappearingDays !== undefined) {
            updates.push('disappearing_days = ?');
            params.push(disappearingDays);
        }

        if (updates.length === 0) return false;

        sql += updates.join(', ') + ' WHERE id = ?';
        params.push(id);

        const [result] = await pool.query(sql, params);
        return result.affectedRows > 0;
    }

    /**
     * Delete group
     */
    static async delete(id) {
        const [result] = await pool.query(
            'DELETE FROM `groups` WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }

    /**
     * Get all groups for a user
     */
    static async findByUserId(userId) {
        const [rows] = await pool.query(`
            SELECT g.*, gm.role as user_role,
                   (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
            FROM \`groups\` g
            JOIN group_members gm ON g.id = gm.group_id
            WHERE gm.user_id = ?
            ORDER BY g.created_at DESC
        `, [userId]);
        return rows;
    }

    /**
     * Add member to group
     */
    static async addMember(groupId, userId, role = 'member') {
        const [result] = await pool.query(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [groupId, userId, role]
        );
        return result.insertId;
    }

    /**
     * Create a join request (when admin approval is required)
     */
    static async createJoinRequest(groupId, userId) {
        const [result] = await pool.query(
            'INSERT INTO group_join_requests (group_id, user_id) VALUES (?, ?)',
            [groupId, userId]
        );
        return result.insertId;
    }

    static async getJoinRequests(groupId) {
        const [rows] = await pool.query(
            'SELECT r.*, u.name, u.email FROM group_join_requests r JOIN users u ON r.user_id = u.id WHERE r.group_id = ? AND r.status = "pending" ORDER BY r.created_at ASC',
            [groupId]
        );
        return rows;
    }

    static async updateJoinRequestStatus(requestId, status) {
        const [result] = await pool.query(
            'UPDATE group_join_requests SET status = ? WHERE id = ?',
            [status, requestId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Remove member from group
     */
    static async removeMember(groupId, userId) {
        const [result] = await pool.query(
            'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
            [groupId, userId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Update member role
     */
    static async updateMemberRole(groupId, userId, role) {
        const [result] = await pool.query(
            'UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?',
            [role, groupId, userId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Get group members
     */
    static async getMembers(groupId) {
        const [rows] = await pool.query(`
            SELECT gm.id as member_id, gm.role, gm.joined_at,
                   u.id, u.name, u.email, u.profile_picture, u.active_status
            FROM group_members gm
            JOIN users u ON gm.user_id = u.id
            WHERE gm.group_id = ? AND u.is_active = TRUE
            ORDER BY 
                CASE gm.role 
                    WHEN 'admin' THEN 1 
                    WHEN 'moderator' THEN 2 
                    ELSE 3 
                END,
                u.name ASC
        `, [groupId]);
        return rows;
    }

    /**
     * Check if user is member
     */
    static async isMember(groupId, userId) {
        const [rows] = await pool.query(
            'SELECT id, role FROM group_members WHERE group_id = ? AND user_id = ?',
            [groupId, userId]
        );
        return rows[0] || null;
    }

    /**
     * Check if user is admin
     */
    static async isAdmin(groupId, userId) {
        const member = await this.isMember(groupId, userId);
        return member && member.role === 'admin';
    }

    /**
     * Check if user is admin or moderator
     */
    static async isAdminOrModerator(groupId, userId) {
        const member = await this.isMember(groupId, userId);
        return member && (member.role === 'admin' || member.role === 'moderator');
    }

    /**
     * Get group permissions
     */
    static async getPermissions(groupId) {
        const [rows] = await pool.query(
            'SELECT * FROM group_permissions WHERE group_id = ?',
            [groupId]
        );
        return rows[0] || null;
    }

    /**
     * Update group permissions
     */
    static async updatePermissions(groupId, permissions) {
        const fields = [
            'edit_settings', 'send_message', 'add_members', 'invite_link',
            'screenshot_block', 'forward_block', 'copy_paste_block',
            'watermark_docs', 'admin_approval'
        ];

        const updates = [];
        const params = [];

        for (const field of fields) {
            if (permissions[field] !== undefined) {
                updates.push(`${field} = ?`);
                params.push(permissions[field]);
            }
        }

        if (updates.length === 0) return false;

        params.push(groupId);
        const [result] = await pool.query(
            `UPDATE group_permissions SET ${updates.join(', ')} WHERE group_id = ?`,
            params
        );
        return result.affectedRows > 0;
    }

    /**
     * Create invite link record
     */
    static async createInviteLink(groupId, token, expiresAt = null, createdBy) {
        const [result] = await pool.query(
            'INSERT INTO group_invite_links (group_id, token, expires_at, created_by) VALUES (?, ?, ?, ?)',
            [groupId, token, expiresAt, createdBy]
        );
        return result.insertId;
    }

    static async getInviteLinks(groupId) {
        const [rows] = await pool.query(
            'SELECT id, token, expires_at, created_by, created_at FROM group_invite_links WHERE group_id = ? ORDER BY created_at DESC',
            [groupId]
        );
        return rows;
    }

    static async deleteInviteLink(inviteId) {
        const [result] = await pool.query(
            'DELETE FROM group_invite_links WHERE id = ?',
            [inviteId]
        );
        return result.affectedRows > 0;
    }

    static async findInviteByToken(token) {
        const [rows] = await pool.query(
            'SELECT * FROM group_invite_links WHERE token = ?',
            [token]
        );
        return rows[0] || null;
    }
}

module.exports = GroupModel;
