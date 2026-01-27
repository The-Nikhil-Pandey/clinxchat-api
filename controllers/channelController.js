const ChannelModel = require('../models/channelModel');
const TeamModel = require('../models/teamModel');
const { pool } = require('../config/db');

/**
 * Channel Controller - Handles channel operations
 */
class ChannelController {

    /**
     * Create a new channel
     * POST /api/channels
     */
    static async create(req, res) {
        try {
            const { name, description, type } = req.body;
            const teamId = req.teamId;
            const userId = req.user.id;

            if (!name || name.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Channel name must be at least 2 characters'
                });
            }

            // Validate channel name format (alphanumeric, hyphens, underscores)
            const channelName = name.toLowerCase().replace(/\s+/g, '-');
            if (!/^[a-z0-9_-]+$/.test(channelName)) {
                return res.status(400).json({
                    success: false,
                    message: 'Channel name can only contain letters, numbers, hyphens, and underscores'
                });
            }

            // Check if channel name already exists in team
            const existingChannels = await ChannelModel.findByTeamId(teamId);
            const nameExists = existingChannels.some(c => c.name.toLowerCase() === channelName);
            if (nameExists) {
                return res.status(400).json({
                    success: false,
                    message: 'A channel with this name already exists'
                });
            }

            const channel = await ChannelModel.create({
                teamId,
                name: channelName,
                description: description?.trim(),
                type: type || 'public',
                createdBy: userId
            });

            // If public channel, add all team members
            if (type === 'public' || !type) {
                const members = await TeamModel.getMembers(teamId);
                for (const member of members) {
                    await ChannelModel.addMember(channel.id, member.id);
                }
            }

            res.status(201).json({
                success: true,
                message: 'Channel created successfully',
                data: channel
            });
        } catch (error) {
            console.error('Create channel error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create channel'
            });
        }
    }

    /**
     * Get all channels for current team
     * GET /api/channels
     */
    static async getAll(req, res) {
        try {
            const teamId = req.teamId;
            const userId = req.user.id;

            const channels = await ChannelModel.findByUserId(userId, teamId);

            res.json({
                success: true,
                data: channels
            });
        } catch (error) {
            console.error('Get channels error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get channels'
            });
        }
    }

    /**
     * Get channel by ID
     * GET /api/channels/:id
     */
    static async getById(req, res) {
        try {
            const channelId = parseInt(req.params.id);
            const channel = await ChannelModel.findById(channelId);

            if (!channel) {
                return res.status(404).json({
                    success: false,
                    message: 'Channel not found'
                });
            }

            // Verify channel belongs to user's current team
            if (channel.team_id !== req.teamId) {
                return res.status(403).json({
                    success: false,
                    message: 'Channel not in current team'
                });
            }

            // Check if user is member
            const isMember = await ChannelModel.isMember(channelId, req.user.id);
            channel.is_member = isMember;

            res.json({
                success: true,
                data: channel
            });
        } catch (error) {
            console.error('Get channel error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get channel'
            });
        }
    }

    /**
     * Update channel
     * PUT /api/channels/:id
     */
    static async update(req, res) {
        try {
            const channelId = parseInt(req.params.id);
            const { name, description, type } = req.body;

            const channel = await ChannelModel.findById(channelId);
            if (!channel) {
                return res.status(404).json({
                    success: false,
                    message: 'Channel not found'
                });
            }

            if (channel.team_id !== req.teamId) {
                return res.status(403).json({
                    success: false,
                    message: 'Channel not in current team'
                });
            }

            // Can't update default channels (except description)
            if (channel.is_default && (name || type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot modify name or type of default channels'
                });
            }

            await ChannelModel.update(channelId, {
                name: name?.toLowerCase().replace(/\s+/g, '-'),
                description: description?.trim(),
                type
            });

            const updatedChannel = await ChannelModel.findById(channelId);

            res.json({
                success: true,
                message: 'Channel updated successfully',
                data: updatedChannel
            });
        } catch (error) {
            console.error('Update channel error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update channel'
            });
        }
    }

    /**
     * Delete channel
     * DELETE /api/channels/:id
     */
    static async delete(req, res) {
        try {
            const channelId = parseInt(req.params.id);

            const channel = await ChannelModel.findById(channelId);
            if (!channel) {
                return res.status(404).json({
                    success: false,
                    message: 'Channel not found'
                });
            }

            if (channel.is_default) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete default channels'
                });
            }

            await ChannelModel.softDelete(channelId);

            res.json({
                success: true,
                message: 'Channel deleted successfully'
            });
        } catch (error) {
            console.error('Delete channel error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete channel'
            });
        }
    }

    /**
     * Join channel
     * POST /api/channels/:id/join
     */
    static async join(req, res) {
        try {
            const channelId = parseInt(req.params.id);
            const userId = req.user.id;

            const channel = await ChannelModel.findById(channelId);
            if (!channel) {
                return res.status(404).json({
                    success: false,
                    message: 'Channel not found'
                });
            }

            if (channel.team_id !== req.teamId) {
                return res.status(403).json({
                    success: false,
                    message: 'Channel not in current team'
                });
            }

            // Private channels require admin to add
            if (channel.type === 'private') {
                const isAdmin = ['owner', 'admin'].includes(req.teamRole);
                if (!isAdmin) {
                    return res.status(403).json({
                        success: false,
                        message: 'Private channels require admin to add members'
                    });
                }
            }

            await ChannelModel.addMember(channelId, userId);

            res.json({
                success: true,
                message: `Joined #${channel.name}`
            });
        } catch (error) {
            console.error('Join channel error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to join channel'
            });
        }
    }

    /**
     * Leave channel
     * POST /api/channels/:id/leave
     */
    static async leave(req, res) {
        try {
            const channelId = parseInt(req.params.id);
            const userId = req.user.id;

            const channel = await ChannelModel.findById(channelId);
            if (!channel) {
                return res.status(404).json({
                    success: false,
                    message: 'Channel not found'
                });
            }

            // Can't leave default channels
            if (channel.is_default) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot leave default channels'
                });
            }

            await ChannelModel.removeMember(channelId, userId);

            res.json({
                success: true,
                message: `Left #${channel.name}`
            });
        } catch (error) {
            console.error('Leave channel error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to leave channel'
            });
        }
    }

    /**
     * Get channel members
     * GET /api/channels/:id/members
     */
    static async getMembers(req, res) {
        try {
            const channelId = parseInt(req.params.id);
            const members = await ChannelModel.getMembers(channelId);

            res.json({
                success: true,
                data: members
            });
        } catch (error) {
            console.error('Get channel members error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get channel members'
            });
        }
    }

    /**
     * Send message to channel
     * POST /api/channels/:id/messages
     */
    static async sendMessage(req, res) {
        try {
            const channelId = parseInt(req.params.id);
            const userId = req.user.id;
            const teamId = req.teamId;
            const { content, messageType, filePath, duration } = req.body;

            // Verify user is channel member
            const isMember = await ChannelModel.isMember(channelId, userId);
            if (!isMember) {
                return res.status(403).json({
                    success: false,
                    message: 'You must join this channel to send messages'
                });
            }

            // Get channel's chat_id (we'll create one if needed)
            const channel = await ChannelModel.findById(channelId);

            // Find or create a chat for this channel
            let chatId;
            const [chatRows] = await pool.query(
                `SELECT id FROM chats WHERE type = 'group' AND group_id IS NULL AND id IN 
                 (SELECT chat_id FROM messages WHERE channel_id = ?) LIMIT 1`,
                [channelId]
            );

            if (chatRows.length > 0) {
                chatId = chatRows[0].id;
            } else {
                // Create a new chat for the channel
                const [result] = await pool.query(
                    `INSERT INTO chats (type) VALUES ('group')`
                );
                chatId = result.insertId;
            }

            // Insert message
            const [msgResult] = await pool.query(
                `INSERT INTO messages (chat_id, channel_id, team_id, sender_id, message_type, content, file_path, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [chatId, channelId, teamId, userId, messageType || 'text', content, filePath || null, duration || null]
            );

            // Get the created message with sender info
            const [messages] = await pool.query(
                `SELECT m.*, u.name as sender_name, u.profile_picture as sender_picture
                 FROM messages m
                 JOIN users u ON m.sender_id = u.id
                 WHERE m.id = ?`,
                [msgResult.insertId]
            );

            const message = messages[0];

            // Emit via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to(`channel_${channelId}`).emit('channel_message', {
                    channelId,
                    message
                });
            }

            res.status(201).json({
                success: true,
                data: message
            });
        } catch (error) {
            console.error('Send channel message error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send message'
            });
        }
    }

    /**
     * Get channel messages
     * GET /api/channels/:id/messages
     */
    static async getMessages(req, res) {
        try {
            const channelId = parseInt(req.params.id);
            const userId = req.user.id;
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;

            // Verify user is channel member
            const isMember = await ChannelModel.isMember(channelId, userId);
            if (!isMember) {
                return res.status(403).json({
                    success: false,
                    message: 'You must join this channel to view messages'
                });
            }

            const [messages] = await pool.query(
                `SELECT m.*, u.name as sender_name, u.profile_picture as sender_picture
                 FROM messages m
                 JOIN users u ON m.sender_id = u.id
                 WHERE m.channel_id = ?
                 ORDER BY m.created_at DESC
                 LIMIT ? OFFSET ?`,
                [channelId, limit, offset]
            );

            // Update last read
            await ChannelModel.updateLastRead(channelId, userId);

            res.json({
                success: true,
                data: messages.reverse() // Return in chronological order
            });
        } catch (error) {
            console.error('Get channel messages error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get messages'
            });
        }
    }
}

module.exports = ChannelController;
