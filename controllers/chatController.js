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
            let messages = await MessageModel.findByChatId(chatId, req.user.id, limit, offset);

            // Read Receipt Privacy: If either user has it off, hide seen_at for private chats
            const currentUser = await UserModel.findById(req.user.id);
            if (!currentUser.read_receipts || !otherUser.read_receipts) {
                messages = messages.map(m => ({ ...m, seen_at: null }));
            }

            // Mark messages as seen - only if user has read receipts enabled
            if (currentUser.read_receipts) {
                await MessageModel.markAsSeen(chatId, req.user.id);
            }

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
            const { receiverId, content, messageType, filePath, duration, metadata } = req.body;

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
                duration,
                metadata
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
            let messages = await MessageModel.findByChatId(chatId, req.user.id, limit, offset);

            // Read Receipt Privacy logic
            const chat = await ChatModel.findById(chatId);
            if (chat && chat.type === 'private') {
                const participants = await ChatModel.getParticipants(chatId);
                const otherParticipant = participants.find(p => p.id !== req.user.id);
                const currentUser = await UserModel.findById(req.user.id);

                if (otherParticipant) {
                    const otherUser = await UserModel.findById(otherParticipant.id);
                    if (!currentUser.read_receipts || (otherUser && !otherUser.read_receipts)) {
                        messages = messages.map(m => ({ ...m, seen_at: null }));
                    }
                }

                // Mark as seen only if current user has read receipts enabled
                if (currentUser.read_receipts) {
                    await MessageModel.markAsSeen(chatId, req.user.id);
                }
            } else {
                // For groups, we still mark as seen but maybe don't redact yet?
                // User specifically mentioned "jaise whatsapp me hota hai" which is mainly private chats for receipts off
                await MessageModel.markAsSeen(chatId, req.user.id);
            }

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
     * Search messages in a chat
     * GET /api/chats/:chatId/messages/search
     */
    static async searchMessages(req, res) {
        try {
            const chatId = parseInt(req.params.chatId);
            const query = req.query.q;

            if (!query) {
                return res.status(400).json({
                    success: false,
                    message: 'Search query is required'
                });
            }

            // Check if user is participant
            const isParticipant = await ChatModel.isParticipant(chatId, req.user.id);
            if (!isParticipant) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a participant of this chat'
                });
            }

            const messages = await MessageModel.findByQuery(chatId, req.user.id, query);

            res.status(200).json({
                success: true,
                data: messages
            });
        } catch (error) {
            console.error('Search messages error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to search messages',
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

            const currentUser = await UserModel.findById(req.user.id);
            if (!currentUser.read_receipts) {
                return res.status(200).json({
                    success: true,
                    message: `Read receipts are disabled`
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

    /**
     * Bulk favorite/unfavorite chats
     * PUT /api/chats/bulk/favorite
     */
    static async bulkFavorite(req, res) {
        try {
            const { chatIds, favorite } = req.body;
            await ChatModel.updateBulkStatus(req.user.id, chatIds, 'is_favourite', favorite);
            res.status(200).json({ success: true, message: 'Chats updated' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Bulk archive/unarchive chats
     * PUT /api/chats/bulk/archive
     */
    static async bulkArchive(req, res) {
        try {
            const { chatIds, archive } = req.body;
            await ChatModel.updateBulkStatus(req.user.id, chatIds, 'is_archived', archive);
            res.status(200).json({ success: true, message: 'Chats updated' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Bulk pin/unpin chats
     * PUT /api/chats/bulk/pin
     */
    static async bulkPin(req, res) {
        try {
            const { chatIds, pin } = req.body;

            // If pinning (pin === true), we must check the limit
            if (pin) {
                const currentChats = await ChatModel.findByUserId(req.user.id);
                const pinnedCount = currentChats.filter(c => c.is_pinned).length;

                // If it's a single chat, check if count + 1 > 3
                // If it's multiple, check if current pinned + newly pinned > 3
                // Note: ChatIds could include chats that are already pinned, but updateBulkStatus won't increase the count there.
                // However, for simplicity and safety:
                const currentlyPinnedIds = currentChats.filter(c => c.is_pinned).map(c => c.id);
                const newlyPinnedCount = chatIds.filter(id => !currentlyPinnedIds.includes(id)).length;

                if (pinnedCount + newlyPinnedCount > 3) {
                    return res.status(400).json({
                        success: false,
                        message: 'You can only pin up to 3 chats'
                    });
                }
            }

            await ChatModel.updateBulkStatus(req.user.id, chatIds, 'is_pinned', pin);
            res.status(200).json({ success: true, message: 'Chats updated' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Delete message for everyone
     * DELETE /api/chats/messages/:messageId/everyone
     */
    static async deleteForEveryone(req, res) {
        try {
            const messageId = parseInt(req.params.messageId);
            const success = await MessageModel.deleteForEveryone(messageId, req.user.id);

            if (success && req.app.get('io')) {
                const message = await MessageModel.findById(messageId);
                if (message) {
                    req.app.get('io').to(`chat:${message.chat_id}`).emit('message_deleted', {
                        messageId,
                        chatId: message.chat_id,
                        type: 'everyone'
                    });
                }
            }

            res.status(200).json({ success, message: success ? 'Message deleted for everyone' : 'Failed or unauthorized' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Delete message for me
     * DELETE /api/chats/messages/:messageId/me
     */
    static async deleteForMe(req, res) {
        try {
            const messageId = parseInt(req.params.messageId);
            const success = await MessageModel.deleteForMe(messageId, req.user.id);
            res.status(200).json({ success, message: success ? 'Message deleted for you' : 'Failed' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Clear chat history for user
     * DELETE /api/chats/:chatId/clear
     */
    static async clearChat(req, res) {
        try {
            const chatId = parseInt(req.params.chatId);
            const success = await MessageModel.clearChat(chatId, req.user.id);
            res.status(200).json({ success, message: success ? 'Chat cleared' : 'Failed' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Bulk delete chats
     * DELETE /api/chats/bulk/delete
     */
    static async bulkDelete(req, res) {
        try {
            const { chatIds } = req.body;
            await ChatModel.deleteChats(req.user.id, chatIds);
            res.status(200).json({ success: true, message: 'Chats deleted' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Bulk delete messages for everyone
     * DELETE /api/chats/messages/bulk/everyone
     */
    static async bulkDeleteMessagesForEveryone(req, res) {
        try {
            const { messageIds } = req.body;
            if (!messageIds || !Array.isArray(messageIds)) {
                return res.status(400).json({ success: false, message: 'messageIds must be an array' });
            }

            const count = await MessageModel.deleteBulkForEveryone(messageIds, req.user.id);

            if (count > 0 && req.app.get('io')) {
                // Get chat_id from the first message to notify participants
                // In a perfect world, we'd group by chat_id, but here we assume multi-select is within one chat
                const firstMsg = await MessageModel.findById(messageIds[0]);
                if (firstMsg) {
                    req.app.get('io').to(`chat:${firstMsg.chat_id}`).emit('messages_bulk_deleted', {
                        messageIds,
                        chatId: firstMsg.chat_id,
                        type: 'everyone'
                    });
                }
            }

            res.status(200).json({ success: true, message: `${count} messages deleted for everyone` });
        } catch (error) {
            console.error('Bulk delete for everyone error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Bulk delete messages for me
     * DELETE /api/chats/messages/bulk/me
     */
    static async bulkDeleteMessagesForMe(req, res) {
        try {
            const { messageIds } = req.body;
            if (!messageIds || !Array.isArray(messageIds)) {
                return res.status(400).json({ success: false, message: 'messageIds must be an array' });
            }

            const count = await MessageModel.deleteBulkForMe(messageIds, req.user.id);
            res.status(200).json({ success: true, message: `${count} messages deleted for you` });
        } catch (error) {
            console.error('Bulk delete for me error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = ChatController;
