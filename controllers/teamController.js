const TeamModel = require('../models/teamModel');
const InviteModel = require('../models/inviteModel');
const ChannelModel = require('../models/channelModel');

/**
 * Team Controller - Handles team/workspace operations
 */
class TeamController {

    /**
     * Create a new team
     * POST /api/teams
     */
    static async create(req, res) {
        try {
            const { name, description } = req.body;
            const userId = req.user.id;

            if (!name || name.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Team name must be at least 2 characters'
                });
            }

            // Generate unique slug
            const slug = await TeamModel.generateSlug(name.trim());

            // Create team
            const team = await TeamModel.create({
                name: name.trim(),
                slug,
                description: description?.trim() || null,
                ownerId: userId
            });

            res.status(201).json({
                success: true,
                message: 'Team created successfully',
                data: team
            });
        } catch (error) {
            console.error('Create team error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create team'
            });
        }
    }

    /**
     * Get current user's teams
     * GET /api/teams
     */
    static async getMyTeams(req, res) {
        try {
            const teams = await TeamModel.findByUserId(req.user.id);

            res.json({
                success: true,
                data: teams
            });
        } catch (error) {
            console.error('Get teams error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get teams'
            });
        }
    }

    /**
     * Get team by ID
     * GET /api/teams/:id
     */
    static async getById(req, res) {
        try {
            const teamId = parseInt(req.params.id);
            const team = await TeamModel.findById(teamId);

            if (!team) {
                return res.status(404).json({
                    success: false,
                    message: 'Team not found'
                });
            }

            // Verify user is member
            const isMember = await TeamModel.isMember(teamId, req.user.id);
            if (!isMember) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this team'
                });
            }

            const userRole = await TeamModel.getUserRole(teamId, req.user.id);
            team.user_role = userRole;

            res.json({
                success: true,
                data: team
            });
        } catch (error) {
            console.error('Get team error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get team'
            });
        }
    }

    /**
     * Update team
     * PUT /api/teams/:id
     */
    static async update(req, res) {
        try {
            const teamId = parseInt(req.params.id);
            const { name, description, logo } = req.body;

            const updated = await TeamModel.update(teamId, {
                name: name?.trim(),
                description: description?.trim(),
                logo
            });

            if (!updated) {
                return res.status(400).json({
                    success: false,
                    message: 'No changes made'
                });
            }

            const team = await TeamModel.findById(teamId);

            res.json({
                success: true,
                message: 'Team updated successfully',
                data: team
            });
        } catch (error) {
            console.error('Update team error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update team'
            });
        }
    }

    /**
     * Delete team (soft delete)
     * DELETE /api/teams/:id
     */
    static async delete(req, res) {
        try {
            const teamId = parseInt(req.params.id);

            // Only owner can delete
            const team = await TeamModel.findById(teamId);
            if (team.owner_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Only the team owner can delete the team'
                });
            }

            await TeamModel.softDelete(teamId);

            res.json({
                success: true,
                message: 'Team deleted successfully'
            });
        } catch (error) {
            console.error('Delete team error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete team'
            });
        }
    }

    /**
     * Get team members
     * GET /api/teams/:id/members
     */
    static async getMembers(req, res) {
        try {
            const teamId = parseInt(req.params.id);
            const members = await TeamModel.getMembers(teamId);

            res.json({
                success: true,
                data: members
            });
        } catch (error) {
            console.error('Get members error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get team members'
            });
        }
    }

    /**
     * Remove member from team
     * DELETE /api/teams/:id/members/:userId
     */
    static async removeMember(req, res) {
        try {
            const teamId = parseInt(req.params.id);
            const memberUserId = parseInt(req.params.userId);

            // Can't remove yourself if you're the owner
            const team = await TeamModel.findById(teamId);
            if (team.owner_id === memberUserId) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot remove the team owner'
                });
            }

            // Check if current user has permission (admin/owner)
            const currentUserRole = await TeamModel.getUserRole(teamId, req.user.id);
            const targetUserRole = await TeamModel.getUserRole(teamId, memberUserId);

            // Owners can remove anyone, admins can only remove members
            if (currentUserRole === 'admin' && targetUserRole !== 'member') {
                return res.status(403).json({
                    success: false,
                    message: 'Admins can only remove regular members'
                });
            }

            await TeamModel.removeMember(teamId, memberUserId);

            res.json({
                success: true,
                message: 'Member removed successfully'
            });
        } catch (error) {
            console.error('Remove member error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to remove member'
            });
        }
    }

    /**
     * Update member role
     * PUT /api/teams/:id/members/:userId
     */
    static async updateMemberRole(req, res) {
        try {
            const teamId = parseInt(req.params.id);
            const memberUserId = parseInt(req.params.userId);
            const { role } = req.body;

            if (!['admin', 'member'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid role. Use "admin" or "member"'
                });
            }

            // Can't change owner's role
            const team = await TeamModel.findById(teamId);
            if (team.owner_id === memberUserId) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot change owner role'
                });
            }

            await TeamModel.updateMemberRole(teamId, memberUserId, role);

            res.json({
                success: true,
                message: 'Member role updated successfully'
            });
        } catch (error) {
            console.error('Update member role error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update member role'
            });
        }
    }

    /**
     * Switch current team
     * POST /api/teams/:id/switch
     */
    static async switchTeam(req, res) {
        try {
            const teamId = parseInt(req.params.id);
            const userId = req.user.id;

            await TeamModel.switchTeam(userId, teamId);

            const team = await TeamModel.findById(teamId);
            const role = await TeamModel.getUserRole(teamId, userId);

            res.json({
                success: true,
                message: 'Switched to team successfully',
                data: {
                    team,
                    role
                }
            });
        } catch (error) {
            console.error('Switch team error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to switch team'
            });
        }
    }

    /**
     * Get team dashboard stats (admin only)
     * GET /api/teams/:id/stats
     */
    static async getStats(req, res) {
        try {
            const teamId = parseInt(req.params.id);

            const memberCount = await TeamModel.getMemberCount(teamId);
            const team = await TeamModel.findById(teamId);

            // Get channel count
            const channels = await ChannelModel.findByTeamId(teamId);

            // Get pending invites count
            const invites = await InviteModel.findPendingByTeamId(teamId);

            res.json({
                success: true,
                data: {
                    member_count: memberCount,
                    member_limit: team.member_limit,
                    channel_count: channels.length,
                    pending_invites: invites.length,
                    plan: team.plan,
                    usage_percent: Math.round((memberCount / team.member_limit) * 100)
                }
            });
        } catch (error) {
            console.error('Get stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get team stats'
            });
        }
    }
}

module.exports = TeamController;
