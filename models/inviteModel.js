const { pool } = require('../config/db');
const crypto = require('crypto');

/**
 * Invite Model - Database operations for team invitations
 */
class InviteModel {

    /**
     * Create a new invite
     */
    static async create(inviteData) {
        const { teamId, email, role, invitedBy, expiresInHours } = inviteData;

        // Generate unique token
        const token = crypto.randomBytes(32).toString('hex');

        // Calculate expiry (default 7 days)
        const hours = expiresInHours || 168; // 7 days
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

        // Check if invite already exists for this email and team
        const existing = await this.findPendingByEmail(teamId, email);
        if (existing) {
            // Update existing invite
            await pool.query(
                `UPDATE team_invites SET token = ?, expires_at = ?, invited_by = ?, role = ?
                 WHERE id = ?`,
                [token, expiresAt, invitedBy, role || 'member', existing.id]
            );
            return {
                id: existing.id,
                team_id: teamId,
                email,
                token,
                role: role || 'member',
                expires_at: expiresAt,
                updated: true
            };
        }

        const [result] = await pool.query(
            `INSERT INTO team_invites (team_id, email, token, role, invited_by, expires_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [teamId, email, token, role || 'member', invitedBy, expiresAt]
        );

        return {
            id: result.insertId,
            team_id: teamId,
            email,
            token,
            role: role || 'member',
            expires_at: expiresAt
        };
    }

    /**
     * Find invite by token
     */
    static async findByToken(token) {
        const [rows] = await pool.query(
            `SELECT i.*, t.name as team_name, t.slug as team_slug,
                    u.name as invited_by_name
             FROM team_invites i
             JOIN teams t ON i.team_id = t.id
             LEFT JOIN users u ON i.invited_by = u.id
             WHERE i.token = ?`,
            [token]
        );
        return rows[0] || null;
    }

    /**
     * Find pending invite by email for a team
     */
    static async findPendingByEmail(teamId, email) {
        const [rows] = await pool.query(
            `SELECT * FROM team_invites 
             WHERE team_id = ? AND email = ? AND accepted_at IS NULL AND expires_at > NOW()`,
            [teamId, email]
        );
        return rows[0] || null;
    }

    /**
     * Get all pending invites for a team
     */
    static async findPendingByTeamId(teamId) {
        const [rows] = await pool.query(
            `SELECT i.*, u.name as invited_by_name
             FROM team_invites i
             LEFT JOIN users u ON i.invited_by = u.id
             WHERE i.team_id = ? AND i.accepted_at IS NULL AND i.expires_at > NOW()
             ORDER BY i.created_at DESC`,
            [teamId]
        );
        return rows;
    }

    /**
     * Count pending invites for a team (for member limit enforcement)
     */
    static async countPendingByTeamId(teamId) {
        const [rows] = await pool.query(
            `SELECT COUNT(*) as count FROM team_invites 
             WHERE team_id = ? AND accepted_at IS NULL AND expires_at > NOW()`,
            [teamId]
        );
        return rows[0]?.count || 0;
    }

    /**
     * Validate and use invite token
     */
    static async validateToken(token) {
        const invite = await this.findByToken(token);

        if (!invite) {
            return { valid: false, error: 'Invalid invite token' };
        }

        if (invite.accepted_at) {
            return { valid: false, error: 'Invite already used' };
        }

        if (new Date(invite.expires_at) < new Date()) {
            return { valid: false, error: 'Invite has expired' };
        }

        return { valid: true, invite };
    }

    /**
     * Accept invite
     */
    static async accept(token) {
        const [result] = await pool.query(
            `UPDATE team_invites SET accepted_at = CURRENT_TIMESTAMP 
             WHERE token = ? AND accepted_at IS NULL`,
            [token]
        );
        return result.affectedRows > 0;
    }

    /**
     * Delete invite
     */
    static async delete(id) {
        const [result] = await pool.query(
            `DELETE FROM team_invites WHERE id = ?`,
            [id]
        );
        return result.affectedRows > 0;
    }

    /**
     * Delete expired invites
     */
    static async deleteExpired() {
        const [result] = await pool.query(
            `DELETE FROM team_invites WHERE expires_at < NOW() AND accepted_at IS NULL`
        );
        return result.affectedRows;
    }

    /**
     * Check if email has pending invite for team
     */
    static async hasPendingInvite(teamId, email) {
        const [rows] = await pool.query(
            `SELECT id FROM team_invites 
             WHERE team_id = ? AND email = ? AND accepted_at IS NULL AND expires_at > NOW()`,
            [teamId, email]
        );
        return rows.length > 0;
    }

    /**
     * Get invite by ID
     */
    static async findById(id) {
        const [rows] = await pool.query(
            `SELECT i.*, t.name as team_name
             FROM team_invites i
             JOIN teams t ON i.team_id = t.id
             WHERE i.id = ?`,
            [id]
        );
        return rows[0] || null;
    }

    /**
     * Resend invite (regenerate token and extend expiry)
     */
    static async resend(id, newExpiresInHours = 168) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + newExpiresInHours * 60 * 60 * 1000);

        const [result] = await pool.query(
            `UPDATE team_invites SET token = ?, expires_at = ? WHERE id = ?`,
            [token, expiresAt, id]
        );

        if (result.affectedRows > 0) {
            return { token, expires_at: expiresAt };
        }
        return null;
    }

    /**
     * Find all pending invites for a user email (across all teams)
     */
    static async findPendingByUserEmail(email) {
        const [rows] = await pool.query(
            `SELECT i.*, t.name as team_name, t.slug as team_slug, t.logo as team_logo,
                    u.name as invited_by_name
             FROM team_invites i
             JOIN teams t ON i.team_id = t.id
             LEFT JOIN users u ON i.invited_by = u.id
             WHERE LOWER(i.email) = LOWER(?) AND i.accepted_at IS NULL AND i.expires_at > NOW()
             ORDER BY i.created_at DESC`,
            [email]
        );
        return rows;
    }
}

module.exports = InviteModel;
