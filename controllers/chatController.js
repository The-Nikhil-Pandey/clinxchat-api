const ChatModel = require('../models/chatModel');
const MessageModel = require('../models/messageModel');
const UserModel = require('../models/userModel');

/**
 * Chat Controller - Handles chat and message operations
 */
class ChatController {

    /**
     * Get all chats for user
     * GET /api/chats
     */
    static async getAll(req, res) {
        try {
            const chats = await ChatModel.findByUserId(req.user.id);
            res.status(200).json({
                success: true,
                data: chats
            });
        } catch (error) {
            console.error('Get chats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get chats',
                error: error.message
            });
        }
    }

    /**
     * Get private chat with specific user
     * GET /api/chats/private/:userId
     */
    static async getPrivateChat(req, res) {
        try {
            const otherUserId = parseInt(req.params.userId);

            // Check if other user exists
            const otherUser = await UserModel.findById(otherUserId);
            if (!otherUser) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Get or create chat
            const chatId = await ChatModel.getOrCreatePrivateChat(req.user.id, otherUserId);

            // Get messages
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            const messages = await MessageModel.findByChatId(chatId, limit, offset);

            // Mark messages as seen
            await MessageModel.markAsSeen(chatId, req.user.id);

            res.status(200).json({
                success: true,
                data: {
                    chatId,
                    participant: otherUser,
                    messages
                }
            });
        } catch (error) {
            console.error('Get private chat error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get chat',
                error: error.message
            });
        }
    }

    /**
     * Send private message
     * POST /api/chats/private/send
     */
    static async sendPrivateMessage(req, res) {
        try {
            const { receiverId, content, messageType, filePath, duration } = req.body;

            if (!receiverId) {
                return res.status(400).json({
                    success: false,
                    message: 'Receiver ID is required'
                });
            }

            if (!content && !filePath) {
                return res.status(400).json({
                    success: false,
                    message: 'Message content or file is required'
                });
            }

            // Check if receiver exists
            const receiver = await UserModel.findById(receiverId);
            if (!receiver) {
                return res.status(404).json({
                    success: false,
                    message: 'Receiver not found'
                });
            }

            // Get or create chat
            const chatId = await ChatModel.getOrCreatePrivateChat(req.user.id, receiverId);

            // Create message
            const message = await MessageModel.create({
                chatId,
                senderId: req.user.id,
                messageType: messageType || 'text',
                content,
                filePath,
                duration
            });

            // Emit socket event (will be handled by socket handler)
            if (req.app.get('io')) {
                req.app.get('io').to(`user:${receiverId}`).emit('receive_message', {
                    chatId,
                    message
                });
            }

            // Create in-app notification for the receiver
            try {
                const NotificationModel = require('../models/notificationModel');
                const notification = await NotificationModel.create({
                    userId: receiverId,
                    type: 'message',
                    title: `New Message from ${req.user.name}`,
                    message: messageType === 'text' ? content : `Sent a ${messageType}`,
                    data: { chatId, senderId: req.user.id }
                });

                if (req.app.get('io')) {
                    req.app.get('io').to(`user:${receiverId}`).emit('notification', notification);
                }
            } catch (notifError) {
                console.error('Failed to create message notification:', notifError);
            }


            res.status(201).json({
                success: true,
                message: 'Message sent successfully',
                data: message
            });
        } catch (error) {
            console.error('Send message error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send message',
                error: error.message
            });
        }
    }

    /**
     * Get messages for a chat
     * GET /api/chats/:chatId/messages
     */
    static async getMessages(req, res) {
        try {
            const chatId = parseInt(req.params.chatId);

            // Check if user is participant
            const isParticipant = await ChatModel.isParticipant(chatId, req.user.id);
            if (!isParticipant) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a participant of this chat'
                });
            }

            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            const messages = await MessageModel.findByChatId(chatId, limit, offset);

            // Mark as seen
            await MessageModel.markAsSeen(chatId, req.user.id);

            res.status(200).json({
                success: true,
                data: messages
            });
        } catch (error) {
            console.error('Get messages error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get messages',
                error: error.message
            });
        }
    }

    /**
     * Get media for a chat
     * GET /api/chats/:chatId/media
     */
    static async getChatMedia(req, res) {
        try {
            const chatId = parseInt(req.params.chatId);

            // Check if user is participant
            const isParticipant = await ChatModel.isParticipant(chatId, req.user.id);
            if (!isParticipant) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a participant of this chat'
                });
            }

            const type = req.query.type; // image, pdf, voice, video
            const media = await MessageModel.getMediaByChatId(chatId, type);

            res.status(200).json({
                success: true,
                data: media
            });
        } catch (error) {
            console.error('Get chat media error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get media',
                error: error.message
            });
        }
    }

    /**
     * Mark messages as seen
     * PUT /api/chats/:chatId/seen
     */
    static async markAsSeen(req, res) {
        try {
            const chatId = parseInt(req.params.chatId);

            // Check if user is participant
            const isParticipant = await ChatModel.isParticipant(chatId, req.user.id);
            if (!isParticipant) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a participant of this chat'
                });
            }

            const count = await MessageModel.markAsSeen(chatId, req.user.id);

            // Emit socket event
            if (req.app.get('io')) {
                const chat = await ChatModel.findById(chatId);
                const participants = await ChatModel.getParticipants(chatId);
                participants.forEach(p => {
                    req.app.get('io').to(`user:${p.id}`).emit('message_seen', {
                        chatId,
                        userId: req.user.id,
                        groupId: chat.group_id
                    });

                });

            }

            res.status(200).json({
                success: true,
                message: `${count} messages marked as seen`
            });
        } catch (error) {
            console.error('Mark as seen error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark messages as seen',
                error: error.message
            });
        }
    }
}

module.exports = ChatController;
