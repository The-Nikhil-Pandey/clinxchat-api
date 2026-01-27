const InviteModel = require('../models/inviteModel');
const TeamModel = require('../models/teamModel');
const UserModel = require('../models/userModel');
const { sendEmail } = require('../config/email');

/**
 * Invite Controller - Handles team invitation operations
 */
class InviteController {

    /**
     * Send team invite
     * POST /api/teams/:id/invites
     */
    static async create(req, res) {
        try {
            const teamId = parseInt(req.params.id);
            const { email, role } = req.body;
            const invitedBy = req.user.id;

            if (!email || !email.includes('@')) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid email is required'
                });
            }

            // Check member limit (including pending invites)
            const team = await TeamModel.findById(teamId);
            const memberCount = await TeamModel.getMemberCount(teamId);
            const pendingInviteCount = await InviteModel.countPendingByTeamId(teamId);

            // Total = current members + pending invites that might be accepted
            const totalCommitted = memberCount + pendingInviteCount;

            if (totalCommitted >= team.member_limit) {
                return res.status(403).json({
                    success: false,
                    message: 'Team member limit reached. Cancel pending invites or upgrade your plan to add more members.',
                    code: 'MEMBER_LIMIT_REACHED',
                    data: {
                        current_members: memberCount,
                        pending_invites: pendingInviteCount,
                        total: totalCommitted,
                        limit: team.member_limit
                    }
                });
            }

            // Check if user is already a member
            const existingUser = await UserModel.findByEmail(email);
            if (existingUser) {
                const isMember = await TeamModel.isMember(teamId, existingUser.id);
                if (isMember) {
                    return res.status(400).json({
                        success: false,
                        message: 'This user is already a team member'
                    });
                }
            }

            // Only admins can invite as admin
            const inviterRole = await TeamModel.getUserRole(teamId, invitedBy);
            const inviteRole = (role === 'admin' && ['owner', 'admin'].includes(inviterRole))
                ? 'admin'
                : 'member';

            // Create invite
            const invite = await InviteModel.create({
                teamId,
                email: email.toLowerCase().trim(),
                role: inviteRole,
                invitedBy
            });

            // Send invite email
            const inviteUrl = `${process.env.APP_URL || 'http://localhost:8081'}/invite/${invite.token}`;

            try {
                await sendEmail({
                    to: email,
                    subject: `You're invited to join ${team.name} on ClinxChat`,
                    html: `
                            <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">Hi there,</p>
                            <p style="margin: 0 0 20px 0; font-size: 15px; color: #666666; line-height: 1.6;"><strong>${req.user.name}</strong> has invited you to join <strong>${team.name}</strong> on ClinxChat.</p>
                            <p style="margin: 0 0 30px 0; font-size: 15px; color: #666666; line-height: 1.6;">Click the button below to accept the invitation and start chatting with your team:</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${inviteUrl}" 
                                   style="background-color: #BD6ED7; color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block; box-shadow: 0 4px 12px rgba(189, 110, 215, 0.3);">
                                    Accept Invitation
                                </a>
                            </div>
                            <p style="margin: 30px 0 0 0; color: #999; font-size: 13px; text-align: center;">This invitation expires in 7 days.</p>

                    `
                });
            } catch (emailError) {
                console.error('Failed to send invite email:', emailError);
                // Continue even if email fails - invite is still valid
            }

            // Create in-app notification if user already exists
            if (existingUser) {
                try {
                    const NotificationModel = require('../models/notificationModel');
                    const notification = await NotificationModel.create({
                        userId: existingUser.id,
                        type: 'team_invite',
                        title: 'Team Invitation',
                        message: `${req.user.name} invited you to join "${team.name}"`,
                        data: { teamId, inviteId: invite.id, token: invite.token }
                    });

                    // Emit to user if online
                    if (req.app.get('io')) {
                        req.app.get('io').to(`user:${existingUser.id}`).emit('notification', notification);
                    }
                } catch (notifError) {
                    console.error('Failed to create team invite notification:', notifError);
                }
            }


            res.status(201).json({
                success: true,
                message: 'Invitation sent successfully',
                data: {
                    id: invite.id,
                    email: invite.email,
                    role: invite.role,
                    expires_at: invite.expires_at
                }
            });
        } catch (error) {
            console.error('Create invite error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send invitation'
            });
        }
    }

    /**
     * Get pending invites for team
     * GET /api/teams/:id/invites
     */
    static async getPending(req, res) {
        try {
            const teamId = parseInt(req.params.id);
            const invites = await InviteModel.findPendingByTeamId(teamId);

            res.json({
                success: true,
                data: invites
            });
        } catch (error) {
            console.error('Get invites error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get invitations'
            });
        }
    }

    /**
     * Cancel/delete invite
     * DELETE /api/invites/:id
     */
    static async delete(req, res) {
        try {
            const inviteId = parseInt(req.params.id);

            const invite = await InviteModel.findById(inviteId);
            if (!invite) {
                return res.status(404).json({
                    success: false,
                    message: 'Invitation not found'
                });
            }

            // Verify user has permission (must be admin of the team)
            const isAdmin = await TeamModel.isAdmin(invite.team_id, req.user.id);
            if (!isAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'Admin access required'
                });
            }

            await InviteModel.delete(inviteId);

            res.json({
                success: true,
                message: 'Invitation cancelled'
            });
        } catch (error) {
            console.error('Delete invite error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to cancel invitation'
            });
        }
    }

    /**
     * Validate invite token (public endpoint)
     * GET /api/invites/validate/:token
     */
    static async validate(req, res) {
        try {
            const { token } = req.params;
            const result = await InviteModel.validateToken(token);

            if (!result.valid) {
                return res.status(400).json({
                    success: false,
                    message: result.error
                });
            }

            res.json({
                success: true,
                data: {
                    team_name: result.invite.team_name,
                    team_slug: result.invite.team_slug,
                    email: result.invite.email,
                    role: result.invite.role,
                    invited_by_name: result.invite.invited_by_name
                }
            });
        } catch (error) {
            console.error('Validate invite error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to validate invitation'
            });
        }
    }

    /**
     * Accept invite
     * POST /api/invites/accept
     */
    static async accept(req, res) {
        try {
            const { token } = req.body;
            const userId = req.user.id;

            // Validate token
            const result = await InviteModel.validateToken(token);
            if (!result.valid) {
                return res.status(400).json({
                    success: false,
                    message: result.error
                });
            }

            const invite = result.invite;

            // Check if user email matches invite email
            if (req.user.email.toLowerCase() !== invite.email.toLowerCase()) {
                return res.status(403).json({
                    success: false,
                    message: 'This invitation was sent to a different email address'
                });
            }

            // Check if already a member
            const isMember = await TeamModel.isMember(invite.team_id, userId);
            if (isMember) {
                // Already a member, just mark invite as accepted
                await InviteModel.accept(token);

                return res.json({
                    success: true,
                    message: 'You are already a member of this team',
                    data: {
                        team_id: invite.team_id,
                        team_name: invite.team_name
                    }
                });
            }

            // Check member limit before adding (in case limit changed or others joined)
            const team = await TeamModel.findById(invite.team_id);
            const memberCount = await TeamModel.getMemberCount(invite.team_id);

            if (memberCount >= team.member_limit) {
                // Mark invite as expired/cancelled since limit is reached
                await InviteModel.accept(token); // Mark as used to prevent retry

                return res.status(403).json({
                    success: false,
                    message: 'Sorry, this team has reached its member limit. Please contact the team admin to upgrade their plan.',
                    code: 'MEMBER_LIMIT_REACHED',
                    data: {
                        current: memberCount,
                        limit: team.member_limit
                    }
                });
            }

            // Add user to team
            await TeamModel.addMember(invite.team_id, userId, invite.role);

            // Mark invite as accepted
            await InviteModel.accept(token);

            // Get team info (already fetched above)
            // team is already available from the limit check above

            res.json({
                success: true,
                message: `Welcome to ${team.name}!`,
                data: {
                    team_id: team.id,
                    team_name: team.name,
                    team_slug: team.slug,
                    role: invite.role
                }
            });

            // Notify team owner that someone joined
            try {
                const NotificationModel = require('../models/notificationModel');
                const ownerNotification = await NotificationModel.create({
                    userId: team.owner_id,
                    type: 'team_join',
                    title: 'New Team Member',
                    message: `${req.user.name} has joined "${team.name}"`,
                    data: { teamId: team.id, userId: userId }
                });

                if (req.app.get('io')) {
                    req.app.get('io').to(`user:${team.owner_id}`).emit('notification', ownerNotification);
                }
            } catch (notifError) {
                console.error('Failed to notify team owner of join:', notifError);
            }

        } catch (error) {
            console.error('Accept invite error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to accept invitation'
            });
        }
    }

    /**
     * Resend invite
     * POST /api/invites/:id/resend
     */
    static async resend(req, res) {
        try {
            const inviteId = parseInt(req.params.id);

            const invite = await InviteModel.findById(inviteId);
            if (!invite) {
                return res.status(404).json({
                    success: false,
                    message: 'Invitation not found'
                });
            }

            // Regenerate token and extend expiry
            const updated = await InviteModel.resend(inviteId);
            if (!updated) {
                return res.status(400).json({
                    success: false,
                    message: 'Failed to resend invitation'
                });
            }

            // Send new email
            const inviteUrl = `${process.env.APP_URL || 'http://localhost:8081'}/invite/${updated.token}`;

            try {
                await sendEmail({
                    to: invite.email,
                    subject: `Reminder: You're invited to join ${invite.team_name} on ClinxChat`,
                    html: `
                            <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">Hi there,</p>
                            <p style="margin: 0 0 20px 0; font-size: 15px; color: #666666; line-height: 1.6;">This is a reminder that you've been invited to join <strong>${invite.team_name}</strong> on ClinxChat.</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${inviteUrl}" 
                                   style="background-color: #BD6ED7; color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block; box-shadow: 0 4px 12px rgba(189, 110, 215, 0.3);">
                                    Accept Invitation
                                </a>
                            </div>
                            <p style="margin: 30px 0 0 0; color: #999; font-size: 13px; text-align: center;">This invitation expires in 7 days.</p>

                    `
                });
            } catch (emailError) {
                console.error('Failed to send reminder email:', emailError);
            }

            res.json({
                success: true,
                message: 'Invitation resent successfully',
                data: {
                    expires_at: updated.expires_at
                }
            });
        } catch (error) {
            console.error('Resend invite error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to resend invitation'
            });
        }
    }

    /**
     * Get pending invites for current user's email
     * GET /api/invites/me
     */
    static async getMyPendingInvites(req, res) {
        try {
            const userEmail = req.user.email.toLowerCase();
            const invites = await InviteModel.findPendingByUserEmail(userEmail);

            res.json({
                success: true,
                data: invites
            });
        } catch (error) {
            console.error('Get my invites error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get pending invitations'
            });
        }
    }
}

module.exports = InviteController;
