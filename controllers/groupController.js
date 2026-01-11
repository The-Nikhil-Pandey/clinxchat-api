const GroupModel = require('../models/groupModel');
const ChatModel = require('../models/chatModel');
const MessageModel = require('../models/messageModel');
const UserModel = require('../models/userModel');

/**
 * Group Controller - Handles group operations
 */
class GroupController {

    /**
     * Create group
     * POST /api/groups
     */
    static async create(req, res) {
        try {
            const { name, description, disappearingDays, groupType, permissions } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: 'Group name is required'
                });
            }

            const group = await GroupModel.create({
                name,
                description,
                createdBy: req.user.id,
                disappearingDays: disappearingDays || 0,
                groupType: groupType || 'public'
            });

            // Create group chat
            const chatId = await ChatModel.createGroupChat(group.id);

            // Add creator to chat participants so the group shows on their home screen
            const { pool } = require('../config/db');
            await pool.query(
                'INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)',
                [chatId, req.user.id]
            );

            // Update permissions if provided during creation
            if (permissions && Object.keys(permissions).length > 0) {
                await GroupModel.updatePermissions(group.id, permissions);
            }

            // Emit to creator to refresh their dashboard/chat list
            if (req.app.get('io')) {
                req.app.get('io').to(`user:${req.user.id}`).emit('group_added', {
                    groupId: group.id,
                    group: group,
                    chatId: chatId
                });
            }

            res.status(201).json({
                success: true,
                message: 'Group created successfully',
                data: group
            });
        } catch (error) {
            console.error('Create group error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create group',
                error: error.message
            });
        }
    }

    /**
     * Get group by ID
     * GET /api/groups/:id
     */
    static async getById(req, res) {
        try {
            const groupId = parseInt(req.params.id);

            // Check if user is member
            const membership = await GroupModel.isMember(groupId, req.user.id);
            if (!membership) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this group'
                });
            }

            const group = await GroupModel.findById(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            const members = await GroupModel.getMembers(groupId);
            const permissions = await GroupModel.getPermissions(groupId);

            res.status(200).json({
                success: true,
                data: {
                    ...group,
                    members,
                    permissions,
                    userRole: membership.role
                }
            });
        } catch (error) {
            console.error('Get group error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get group',
                error: error.message
            });
        }
    }

    /**
     * Update group
     * PUT /api/groups/:id
     */
    static async update(req, res) {
        try {
            const groupId = parseInt(req.params.id);

            // Check if user is admin OR permissions allow editing
            const isAdmin = await GroupModel.isAdmin(groupId, req.user.id);
            const perms = await GroupModel.getPermissions(groupId);
            if (!isAdmin && !(perms && perms.edit_settings)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins or users with edit permission can update group settings'
                });
            }

            const { name, description, disappearingDays } = req.body;
            const updated = await GroupModel.update(groupId, { name, description, disappearingDays });

            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found or no changes made'
                });
            }

            const group = await GroupModel.findById(groupId);
            res.status(200).json({
                success: true,
                message: 'Group updated successfully',
                data: group
            });
        } catch (error) {
            console.error('Update group error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update group',
                error: error.message
            });
        }
    }

    /**
     * Delete group
     * DELETE /api/groups/:id
     */
    static async delete(req, res) {
        try {
            const groupId = parseInt(req.params.id);

            // Check if user is admin
            const isAdmin = await GroupModel.isAdmin(groupId, req.user.id);
            if (!isAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins can delete the group'
                });
            }

            await GroupModel.delete(groupId);

            res.status(200).json({
                success: true,
                message: 'Group deleted successfully'
            });
        } catch (error) {
            console.error('Delete group error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete group',
                error: error.message
            });
        }
    }

    /**
     * Get user's groups
     * GET /api/groups
     */
    static async getUserGroups(req, res) {
        try {
            const groups = await GroupModel.findByUserId(req.user.id);
            res.status(200).json({
                success: true,
                data: groups
            });
        } catch (error) {
            console.error('Get user groups error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get groups',
                error: error.message
            });
        }
    }

    /**
     * Add member to group
     * POST /api/groups/:id/members
     */
    static async addMember(req, res) {
        try {
            const groupId = parseInt(req.params.id);
            const { userId, role } = req.body;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            // Check permissions: admin/mod or add_members permission
            const isAdminOrMod = await GroupModel.isAdminOrModerator(groupId, req.user.id);
            const perms = await GroupModel.getPermissions(groupId);
            if (!isAdminOrMod && !(perms && perms.add_members)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins, moderators or permissioned users can add members'
                });
            }

            // Check if user exists
            const user = await UserModel.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Check if already a member
            const existing = await GroupModel.isMember(groupId, userId);
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: 'User is already a member'
                });
            }

            // If group requires admin approval and requester is not admin, create a join request instead
            if (perms && perms.admin_approval && !isAdminOrMod) {
                const requestId = await GroupModel.createJoinRequest(groupId, userId);

                // Notify admins about the join request
                const NotificationModel = require('../models/notificationModel');
                const admins = await GroupModel.getMembers(groupId);
                const adminUsers = admins.filter(a => a.role === 'admin');
                for (const admin of adminUsers) {
                    await NotificationModel.create({
                        userId: admin.id,
                        type: 'group_join_request',
                        title: 'Join Request',
                        message: `${req.user.name} requested to join "${(await GroupModel.findById(groupId)).name}"`,
                        data: { groupId, requestId }
                    });
                }

                return res.status(202).json({ success: true, message: 'Join request submitted' });
            }

            await GroupModel.addMember(groupId, userId, role || 'member');

            // Add to group chat participants
            const chat = await ChatModel.findByGroupId(groupId);
            if (chat) {
                const { pool } = require('../config/db');
                await pool.query(
                    'INSERT IGNORE INTO chat_participants (chat_id, user_id) VALUES (?, ?)',
                    [chat.id, userId]
                );
            }

            // Get group info for notification
            const group = await GroupModel.findById(groupId);
            const addedBy = await UserModel.findById(req.user.id);

            // Send notification to the added member
            const NotificationModel = require('../models/notificationModel');
            const notification = await NotificationModel.create({
                userId: userId,
                type: 'group_invite',
                title: 'Added to Group',
                message: `${addedBy.name} added you to the group "${group.name}"`,
                data: {
                    groupId: groupId,
                    groupName: group.name,
                    groupImage: group.image,
                    addedBy: req.user.id,
                    addedByName: addedBy.name,
                    chatId: chat ? chat.id : null
                }
            });

            // Emit socket event to the added user so they get real-time update
            if (req.app.get('io')) {
                // Send notification to the user
                req.app.get('io').to(`user:${userId}`).emit('notification', notification);

                // Also tell them to refresh their chats
                req.app.get('io').to(`user:${userId}`).emit('group_added', {
                    groupId: groupId,
                    group: group,
                    chatId: chat ? chat.id : null
                });
            }

            res.status(201).json({
                success: true,
                message: 'Member added successfully',
                data: user
            });
        } catch (error) {
            console.error('Add member error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add member',
                error: error.message
            });
        }
    }

    /**
     * Remove member from group
     * DELETE /api/groups/:id/members/:userId
     */
    static async removeMember(req, res) {
        try {
            const groupId = parseInt(req.params.id);
            const userId = parseInt(req.params.userId);

            // Check if requester is admin (only admins can remove)
            const isAdmin = await GroupModel.isAdmin(groupId, req.user.id);
            const isSelf = userId === req.user.id;

            if (!isAdmin && !isSelf) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins can remove members'
                });
            }

            // Can't remove the creator
            const group = await GroupModel.findById(groupId);
            if (group && group.created_by === userId && !isSelf) {
                return res.status(403).json({
                    success: false,
                    message: 'Cannot remove the group creator'
                });
            }

            const removed = await GroupModel.removeMember(groupId, userId);
            if (!removed) {
                return res.status(404).json({
                    success: false,
                    message: 'Member not found'
                });
            }

            res.status(200).json({
                success: true,
                message: isSelf ? 'You left the group' : 'Member removed successfully'
            });
        } catch (error) {
            console.error('Remove member error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to remove member',
                error: error.message
            });
        }
    }

    /**
     * Update member role
     * PUT /api/groups/:id/members/:userId
     */
    static async updateMemberRole(req, res) {
        try {
            const groupId = parseInt(req.params.id);
            const userId = parseInt(req.params.userId);
            const { role } = req.body;

            const validRoles = ['admin', 'moderator', 'member'];
            if (!role || !validRoles.includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid role. Use: admin, moderator, or member'
                });
            }

            // Only admins can change roles
            const isAdmin = await GroupModel.isAdmin(groupId, req.user.id);
            if (!isAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins can change member roles'
                });
            }

            const updated = await GroupModel.updateMemberRole(groupId, userId, role);
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: 'Member not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Member role updated successfully'
            });
        } catch (error) {
            console.error('Update member role error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update role',
                error: error.message
            });
        }
    }

    /**
     * Get group permissions
     * GET /api/groups/:id/permissions
     */
    static async getPermissions(req, res) {
        try {
            const groupId = parseInt(req.params.id);

            const membership = await GroupModel.isMember(groupId, req.user.id);
            if (!membership) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this group'
                });
            }

            const permissions = await GroupModel.getPermissions(groupId);
            res.status(200).json({
                success: true,
                data: permissions
            });
        } catch (error) {
            console.error('Get permissions error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get permissions',
                error: error.message
            });
        }
    }

    /**
     * Request to join group (used when admin approval required)
     * POST /api/groups/:id/join-request
     */
    static async joinRequest(req, res) {
        try {
            const groupId = parseInt(req.params.id);

            // Check if already a member
            const existing = await GroupModel.isMember(groupId, req.user.id);
            if (existing) {
                return res.status(400).json({ success: false, message: 'You are already a member' });
            }

            const perms = await GroupModel.getPermissions(groupId);
            if (!perms) {
                return res.status(404).json({ success: false, message: 'Group permissions not found' });
            }

            if (!perms.admin_approval) {
                // If admin approval not required, add directly
                await GroupModel.addMember(groupId, req.user.id, 'member');
                const chat = await ChatModel.findByGroupId(groupId);
                if (chat) {
                    const { pool } = require('../config/db');
                    await pool.query('INSERT IGNORE INTO chat_participants (chat_id, user_id) VALUES (?, ?)', [chat.id, req.user.id]);
                }
                return res.status(201).json({ success: true, message: 'Joined group' });
            }

            // Create join request
            await GroupModel.createJoinRequest(groupId, req.user.id);

            // Notify admins
            const admins = await GroupModel.getMembers(groupId);
            const NotificationModel = require('../models/notificationModel');
            const group = await GroupModel.findById(groupId);
            for (const admin of admins.filter(a => a.role === 'admin')) {
                await NotificationModel.create({
                    userId: admin.id,
                    type: 'group_join_request',
                    title: 'Join Request',
                    message: `${req.user.name} requested to join "${group.name}"`,
                    data: { groupId }
                });
            }

            res.status(202).json({ success: true, message: 'Join request submitted' });
        } catch (error) {
            console.error('Join request error:', error);
            res.status(500).json({ success: false, message: 'Failed to submit join request', error: error.message });
        }
    }

    /**
     * List pending join requests (admin only)
     * GET /api/groups/:id/requests
     */
    static async listJoinRequests(req, res) {
        try {
            const groupId = parseInt(req.params.id);
            const isAdmin = await GroupModel.isAdmin(groupId, req.user.id);
            if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

            const requests = await GroupModel.getJoinRequests(groupId);
            res.status(200).json({ success: true, data: requests });
        } catch (error) {
            console.error('List join requests error:', error);
            res.status(500).json({ success: false, message: 'Failed to list join requests', error: error.message });
        }
    }

    /**
     * Approve a join request
     * POST /api/groups/:id/requests/:requestId/approve
     */
    static async approveJoinRequest(req, res) {
        try {
            const groupId = parseInt(req.params.id);
            const requestId = parseInt(req.params.requestId);
            const isAdmin = await GroupModel.isAdmin(groupId, req.user.id);
            if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

            // Get request
            const [rows] = await require('../config/db').pool.query('SELECT * FROM group_join_requests WHERE id = ? AND group_id = ?', [requestId, groupId]);
            if (!rows[0]) return res.status(404).json({ success: false, message: 'Request not found' });
            const reqRow = rows[0];

            // Add member
            await GroupModel.addMember(groupId, reqRow.user_id, 'member');
            await GroupModel.updateJoinRequestStatus(requestId, 'approved');

            // Notify user
            const NotificationModel = require('../models/notificationModel');
            await NotificationModel.create({ userId: reqRow.user_id, type: 'group_join_approved', title: 'Request Approved', message: `Your request to join group was approved`, data: { groupId } });

            res.status(200).json({ success: true, message: 'Request approved' });
        } catch (error) {
            console.error('Approve join request error:', error);
            res.status(500).json({ success: false, message: 'Failed to approve request', error: error.message });
        }
    }

    /**
     * Reject a join request
     * POST /api/groups/:id/requests/:requestId/reject
     */
    static async rejectJoinRequest(req, res) {
        try {
            const groupId = parseInt(req.params.id);
            const requestId = parseInt(req.params.requestId);
            const isAdmin = await GroupModel.isAdmin(groupId, req.user.id);
            if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

            await GroupModel.updateJoinRequestStatus(requestId, 'rejected');
            res.status(200).json({ success: true, message: 'Request rejected' });
        } catch (error) {
            console.error('Reject join request error:', error);
            res.status(500).json({ success: false, message: 'Failed to reject request', error: error.message });
        }
    }

    /**
     * Update group permissions
     * PUT /api/groups/:id/permissions
     */
    static async updatePermissions(req, res) {
        try {
            const groupId = parseInt(req.params.id);

            const isAdmin = await GroupModel.isAdmin(groupId, req.user.id);
            if (!isAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins can update permissions'
                });
            }

            await GroupModel.updatePermissions(groupId, req.body);
            const permissions = await GroupModel.getPermissions(groupId);

            // Emit socket event so clients in the group are updated instantly
            if (req.app.get('io')) {
                req.app.get('io').to(`group:${groupId}`).emit('group_permissions_updated', { groupId, permissions });
            }

            res.status(200).json({
                success: true,
                message: 'Permissions updated successfully',
                data: permissions
            });
        } catch (error) {
            console.error('Update permissions error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update permissions',
                error: error.message
            });
        }
    }

    /**
     * Invite link management
     */
    static async createInvite(req, res) {
        try {
            const groupId = parseInt(req.params.id);

            // Only admins or permissioned users can create invite links
            const isAdmin = await GroupModel.isAdmin(groupId, req.user.id);
            const perms = await GroupModel.getPermissions(groupId);
            if (!isAdmin && !(perms && perms.invite_link)) {
                return res.status(403).json({ success: false, message: 'Not allowed to create invite links' });
            }

            // Generate a random token
            const crypto = require('crypto');
            const token = crypto.randomBytes(16).toString('hex');

            // Optional expiry in body (ISO string)
            let expiresAt = null;
            if (req.body.expiresAt) {
                expiresAt = new Date(req.body.expiresAt);
            }

            const inviteId = await GroupModel.createInviteLink(groupId, token, expiresAt, req.user.id);

            const inviteUrl = `${process.env.APP_URL || (req.protocol + '://' + req.get('host'))}/groups/join/${token}`;

            res.status(201).json({ success: true, data: { id: inviteId, token, url: inviteUrl, expiresAt } });
        } catch (error) {
            console.error('Create invite error:', error);
            res.status(500).json({ success: false, message: 'Failed to create invite', error: error.message });
        }
    }

    static async listInvites(req, res) {
        try {
            const groupId = parseInt(req.params.id);

            const isAdmin = await GroupModel.isAdmin(groupId, req.user.id);
            if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

            const invites = await GroupModel.getInviteLinks(groupId);
            res.status(200).json({ success: true, data: invites });
        } catch (error) {
            console.error('List invites error:', error);
            res.status(500).json({ success: false, message: 'Failed to list invites', error: error.message });
        }
    }

    static async deleteInvite(req, res) {
        try {
            const groupId = parseInt(req.params.id);
            const inviteId = parseInt(req.params.inviteId);

            const isAdmin = await GroupModel.isAdmin(groupId, req.user.id);
            if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

            const deleted = await GroupModel.deleteInviteLink(inviteId);
            if (!deleted) return res.status(404).json({ success: false, message: 'Invite not found' });

            res.status(200).json({ success: true, message: 'Invite deleted' });
        } catch (error) {
            console.error('Delete invite error:', error);
            res.status(500).json({ success: false, message: 'Failed to delete invite', error: error.message });
        }
    }

    static async joinByToken(req, res) {
        try {
            const token = req.params.token;
            const invite = await GroupModel.findInviteByToken(token);
            if (!invite) return res.status(404).json({ success: false, message: 'Invalid invite token' });

            if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
                return res.status(410).json({ success: false, message: 'Invite has expired' });
            }

            const groupId = invite.group_id;

            // Check if already a member
            const existing = await GroupModel.isMember(groupId, req.user.id);
            if (existing) return res.status(400).json({ success: false, message: 'You are already a member' });

            const perms = await GroupModel.getPermissions(groupId);
            if (perms && perms.admin_approval) {
                // Create a join request instead
                const requestId = await GroupModel.createJoinRequest(groupId, req.user.id);

                // Notify admins
                const admins = await GroupModel.getMembers(groupId);
                const NotificationModel = require('../models/notificationModel');
                const group = await GroupModel.findById(groupId);
                for (const admin of admins.filter(a => a.role === 'admin')) {
                    await NotificationModel.create({ userId: admin.id, type: 'group_join_request', title: 'Join Request', message: `${req.user.name} requested to join "${group.name}" via invite`, data: { groupId, requestId } });
                }

                return res.status(202).json({ success: true, message: 'Join request submitted' });
            }

            // Add directly
            await GroupModel.addMember(groupId, req.user.id, 'member');

            // Add to chat participants
            const chat = await ChatModel.findByGroupId(groupId);
            if (chat) {
                const { pool } = require('../config/db');
                await pool.query('INSERT IGNORE INTO chat_participants (chat_id, user_id) VALUES (?, ?)', [chat.id, req.user.id]);
            }

            // Notify user
            const NotificationModel = require('../models/notificationModel');
            const group = await GroupModel.findById(groupId);
            await NotificationModel.create({ userId: req.user.id, type: 'group_joined', title: 'Joined Group', message: `You joined the group "${group.name}"`, data: { groupId } });

            // Emit group_added to the user
            if (req.app.get('io')) {
                req.app.get('io').to(`user:${req.user.id}`).emit('group_added', { groupId, group, chatId: chat ? chat.id : null });
            }

            res.status(201).json({ success: true, message: 'Joined group', data: { groupId } });
        } catch (error) {
            console.error('Join by token error:', error);
            res.status(500).json({ success: false, message: 'Failed to join by token', error: error.message });
        }
    }

    /**
     * Get group media
     * GET /api/groups/:groupId/media
     */
    static async getGroupMedia(req, res) {
        try {
            const groupId = parseInt(req.params.groupId);

            const membership = await GroupModel.isMember(groupId, req.user.id);
            if (!membership) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this group'
                });
            }

            const chat = await ChatModel.findByGroupId(groupId);
            if (!chat) {
                return res.status(404).json({
                    success: false,
                    message: 'Group chat not found'
                });
            }

            const type = req.query.type;
            const media = await MessageModel.getMediaByChatId(chat.id, type);

            res.status(200).json({
                success: true,
                data: media
            });
        } catch (error) {
            console.error('Get group media error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get media',
                error: error.message
            });
        }
    }

    /**
     * Send message to group
     * POST /api/groups/:id/messages
     */
    static async sendMessage(req, res) {
        try {
            const groupId = parseInt(req.params.id);
            const { content, messageType, filePath, duration } = req.body;

            // Check membership
            const membership = await GroupModel.isMember(groupId, req.user.id);
            if (!membership) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this group'
                });
            }

            // Check permissions
            const permissions = await GroupModel.getPermissions(groupId);
            if (permissions && !permissions.send_message && membership.role === 'member') {
                return res.status(403).json({
                    success: false,
                    message: 'Members cannot send messages in this group'
                });
            }

            if (!content && !filePath) {
                return res.status(400).json({
                    success: false,
                    message: 'Message content or file is required'
                });
            }

            // Get group chat
            const chat = await ChatModel.findByGroupId(groupId);
            if (!chat) {
                return res.status(404).json({
                    success: false,
                    message: 'Group chat not found'
                });
            }

            // Create message
            const message = await MessageModel.create({
                chatId: chat.id,
                senderId: req.user.id,
                messageType: messageType || 'text',
                content,
                filePath,
                duration
            });

            // Emit to group room
            if (req.app.get('io')) {
                req.app.get('io').to(`group:${groupId}`).emit('receive_message', {
                    groupId,
                    chatId: chat.id,
                    message
                });
            }

            res.status(201).json({
                success: true,
                message: 'Message sent successfully',
                data: message
            });
        } catch (error) {
            console.error('Send group message error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send message',
                error: error.message
            });
        }
    }

    /**
     * Get group messages
     * GET /api/groups/:id/messages
     */
    static async getMessages(req, res) {
        try {
            const groupId = parseInt(req.params.id);
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;

            // Check membership
            const membership = await GroupModel.isMember(groupId, req.user.id);
            if (!membership) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this group'
                });
            }

            // Get group chat
            const chat = await ChatModel.findByGroupId(groupId);
            if (!chat) {
                return res.status(404).json({
                    success: false,
                    message: 'Group chat not found'
                });
            }

            // Get messages
            const messages = await MessageModel.findByChatId(chat.id, limit, offset);

            res.status(200).json({
                success: true,
                data: {
                    chatId: chat.id,
                    messages
                }
            });
        } catch (error) {
            console.error('Get group messages error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get messages',
                error: error.message
            });
        }
    }
}

module.exports = GroupController;

