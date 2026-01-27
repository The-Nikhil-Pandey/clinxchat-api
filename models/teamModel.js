const { pool } = require('../config/db');

/**
 * Team Model - Database operations for teams/workspaces
 */
class TeamModel {

    /**
     * Create a new team
     */
    static async create(teamData) {
        const { name, slug, description, ownerId } = teamData;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();
            console.log(`[TeamModel.create] Starting transaction for team: ${name}, owner: ${ownerId}`);

            // Create team
            const [result] = await connection.query(
                `INSERT INTO teams (name, slug, description, owner_id) VALUES (?, ?, ?, ?)`,
                [name, slug, description || null, ownerId]
            );
            const teamId = result.insertId;
            console.log(`[TeamModel.create] Team created with ID: ${teamId}`);

            // Add owner as team member with 'owner' role
            await connection.query(
                `INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'owner')`,
                [teamId, ownerId]
            );
            console.log(`[TeamModel.create] Owner added to team_members`);

            // Update user's current_team_id
            const [updateResult] = await connection.query(
                `UPDATE users SET current_team_id = ? WHERE id = ?`,
                [teamId, ownerId]
            );
            console.log(`[TeamModel.create] User current_team_id updated. Affected rows: ${updateResult.affectedRows}`);

            // Create default channels
            await connection.query(
                `INSERT INTO channels (team_id, name, description, is_default, created_by) VALUES 
                 (?, 'general', 'General discussion', TRUE, ?),
                 (?, 'announcements', 'Team announcements', TRUE, ?)`,
                [teamId, ownerId, teamId, ownerId]
            );
            console.log(`[TeamModel.create] Default channels created`);

            // Get default channel IDs
            const [channels] = await connection.query(
                `SELECT id FROM channels WHERE team_id = ? AND is_default = TRUE`,
                [teamId]
            );

            // Add owner to all default channels
            for (const channel of channels) {
                await connection.query(
                    `INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)`,
                    [channel.id, ownerId]
                );
            }
            console.log(`[TeamModel.create] Owner added to ${channels.length} channels`);

            await connection.commit();
            console.log(`[TeamModel.create] Transaction committed successfully`);

            return {
                id: teamId,
                name,
                slug,
                description,
                owner_id: ownerId,
                plan: 'free',
                member_limit: 5
            };
        } catch (error) {
            console.error(`[TeamModel.create] Error during transaction:`, error);
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Find team by ID
     */
    static async findById(id) {
        const [rows] = await pool.query(
            `SELECT t.*, u.name as owner_name,
                    (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
             FROM teams t
             LEFT JOIN users u ON t.owner_id = u.id
             WHERE t.id = ? AND t.deleted_at IS NULL`,
            [id]
        );
        return rows[0] || null;
    }

    /**
     * Find team by slug
     */
    static async findBySlug(slug) {
        const [rows] = await pool.query(
            `SELECT t.*, u.name as owner_name
             FROM teams t
             LEFT JOIN users u ON t.owner_id = u.id
             WHERE t.slug = ? AND t.deleted_at IS NULL`,
            [slug]
        );
        return rows[0] || null;
    }

    /**
     * Check if slug exists
     */
    static async slugExists(slug) {
        const [rows] = await pool.query(
            `SELECT id FROM teams WHERE slug = ?`,
            [slug]
        );
        return rows.length > 0;
    }

    /**
     * Generate unique slug from name
     */
    static async generateSlug(name) {
        let baseSlug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 50);

        let slug = baseSlug;
        let counter = 1;

        while (await this.slugExists(slug)) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        return slug;
    }

    /**
     * Get all teams for a user
     */
    static async findByUserId(userId) {
        const [rows] = await pool.query(
            `SELECT t.*, tm.role as user_role,
                    (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
             FROM teams t
             JOIN team_members tm ON t.id = tm.team_id
             WHERE tm.user_id = ? AND t.deleted_at IS NULL
             ORDER BY t.created_at DESC`,
            [userId]
        );
        return rows;
    }

    /**
     * Update team
     */
    static async update(id, updateData) {
        const { name, description, logo } = updateData;
        let sql = 'UPDATE teams SET ';
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
        if (logo !== undefined) {
            updates.push('logo = ?');
            params.push(logo);
        }

        if (updates.length === 0) return false;

        sql += updates.join(', ') + ' WHERE id = ?';
        params.push(id);

        const [result] = await pool.query(sql, params);
        return result.affectedRows > 0;
    }

    /**
     * Soft delete team
     */
    static async softDelete(id) {
        const [result] = await pool.query(
            `UPDATE teams SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [id]
        );
        return result.affectedRows > 0;
    }

    /**
     * Get team members
     */
    static async getMembers(teamId) {
        const [rows] = await pool.query(
            `SELECT u.id, u.name, u.email, u.profile_picture, u.active_status,
                    tm.role, tm.joined_at
             FROM team_members tm
             JOIN users u ON tm.user_id = u.id
             WHERE tm.team_id = ? AND u.is_active = TRUE
             ORDER BY 
                CASE tm.role 
                    WHEN 'owner' THEN 1 
                    WHEN 'admin' THEN 2 
                    ELSE 3 
                END,
                tm.joined_at ASC`,
            [teamId]
        );
        return rows;
    }

    /**
     * Add member to team
     */
    static async addMember(teamId, userId, role = 'member') {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Add to team_members
            await connection.query(
                `INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE role = VALUES(role)`,
                [teamId, userId, role]
            );

            // Update user's current_team_id if they don't have one
            await connection.query(
                `UPDATE users SET current_team_id = ? WHERE id = ? AND current_team_id IS NULL`,
                [teamId, userId]
            );

            // Add to all default channels
            const [channels] = await connection.query(
                `SELECT id FROM channels WHERE team_id = ? AND is_default = TRUE`,
                [teamId]
            );

            for (const channel of channels) {
                await connection.query(
                    `INSERT IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)`,
                    [channel.id, userId]
                );
            }

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Remove member from team
     */
    static async removeMember(teamId, userId) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Remove from team_members
            await connection.query(
                `DELETE FROM team_members WHERE team_id = ? AND user_id = ?`,
                [teamId, userId]
            );

            // Remove from all team channels
            await connection.query(
                `DELETE cm FROM channel_members cm
                 JOIN channels c ON cm.channel_id = c.id
                 WHERE c.team_id = ? AND cm.user_id = ?`,
                [teamId, userId]
            );

            // Clear user's current_team_id if it was this team
            await connection.query(
                `UPDATE users SET current_team_id = NULL WHERE id = ? AND current_team_id = ?`,
                [userId, teamId]
            );

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Update member role
     */
    static async updateMemberRole(teamId, userId, role) {
        const [result] = await pool.query(
            `UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?`,
            [role, teamId, userId]
        );
        return result.affectedRows > 0;
    }

    /**
     * Get user's role in team
     */
    static async getUserRole(teamId, userId) {
        const [rows] = await pool.query(
            `SELECT role FROM team_members WHERE team_id = ? AND user_id = ?`,
            [teamId, userId]
        );
        return rows[0]?.role || null;
    }

    /**
     * Check if user is member of team
     */
    static async isMember(teamId, userId) {
        const [rows] = await pool.query(
            `SELECT id FROM team_members WHERE team_id = ? AND user_id = ?`,
            [teamId, userId]
        );
        return rows.length > 0;
    }

    /**
     * Check if user is admin or owner
     */
    static async isAdmin(teamId, userId) {
        const [rows] = await pool.query(
            `SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND role IN ('owner', 'admin')`,
            [teamId, userId]
        );
        return rows.length > 0;
    }

    /**
     * Get member count
     */
    static async getMemberCount(teamId) {
        const [rows] = await pool.query(
            `SELECT COUNT(*) as count FROM team_members WHERE team_id = ?`,
            [teamId]
        );
        return rows[0]?.count || 0;
    }

    /**
     * Switch user's current team
     */
    static async switchTeam(userId, teamId) {
        // Verify user is member of target team
        const isMember = await this.isMember(teamId, userId);
        if (!isMember) {
            throw new Error('User is not a member of this team');
        }

        await pool.query(
            `UPDATE users SET current_team_id = ? WHERE id = ?`,
            [teamId, userId]
        );

        return true;
    }

    /**
     * Update plan
     */
    static async updatePlan(teamId, plan, memberLimit) {
        const [result] = await pool.query(
            `UPDATE teams SET plan = ?, member_limit = ? WHERE id = ?`,
            [plan, memberLimit, teamId]
        );
        return result.affectedRows > 0;
    }
}

module.exports = TeamModel;
