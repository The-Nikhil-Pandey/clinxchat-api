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
            const { name, description, disappearingDays } = req.body;

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
                disappearingDays: disappearingDays || 0
            });

            // Create group chat
            await ChatModel.createGroupChat(group.id);

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

            // Check if user is admin
            const isAdmin = await GroupModel.isAdmin(groupId, req.user.id);
            if (!isAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins can update group settings'
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

            // Check if requester is admin or moderator
            const isAdminOrMod = await GroupModel.isAdminOrModerator(groupId, req.user.id);
            if (!isAdminOrMod) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins and moderators can add members'
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
}

module.exports = GroupController;
