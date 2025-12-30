const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const GroupModel = require('../models/groupModel');

// Store online users
const onlineUsers = new Map();

/**
 * Socket Handler - Real-time communication
 */
const initializeSocket = (io) => {

    // Middleware for authentication
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

            if (!token) {
                return next(new Error('Authentication required'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await UserModel.findById(decoded.id);

            if (!user) {
                return next(new Error('User not found'));
            }

            socket.user = user;
            next();
        } catch (error) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', async (socket) => {
        const userId = socket.user.id;
        console.log(`🔌 User connected: ${socket.user.name} (${userId})`);

        // Add to online users
        onlineUsers.set(userId, socket.id);

        // Join user's personal room
        socket.join(`user:${userId}`);

        // Join all group rooms user is part of
        const groups = await GroupModel.findByUserId(userId);
        groups.forEach(group => {
            socket.join(`group:${group.id}`);
        });

        // Broadcast online status
        socket.broadcast.emit('user_online', {
            userId,
            name: socket.user.name
        });

        // Handle send message (for real-time updates)
        socket.on('send_message', async (data) => {
            const { chatId, receiverId, groupId, message } = data;

            if (groupId) {
                // Group message
                socket.to(`group:${groupId}`).emit('receive_message', {
                    groupId,
                    chatId,
                    message: {
                        ...message,
                        sender_name: socket.user.name,
                        sender_picture: socket.user.profile_picture
                    }
                });
            } else if (receiverId) {
                // Private message
                socket.to(`user:${receiverId}`).emit('receive_message', {
                    chatId,
                    message: {
                        ...message,
                        sender_name: socket.user.name,
                        sender_picture: socket.user.profile_picture
                    }
                });
            }
        });

        // Handle typing indicator
        socket.on('typing', (data) => {
            const { chatId, receiverId, groupId } = data;

            if (groupId) {
                socket.to(`group:${groupId}`).emit('typing', {
                    chatId,
                    groupId,
                    userId,
                    name: socket.user.name
                });
            } else if (receiverId) {
                socket.to(`user:${receiverId}`).emit('typing', {
                    chatId,
                    userId,
                    name: socket.user.name
                });
            }
        });

        // Handle stop typing
        socket.on('stop_typing', (data) => {
            const { chatId, receiverId, groupId } = data;

            if (groupId) {
                socket.to(`group:${groupId}`).emit('stop_typing', {
                    chatId,
                    groupId,
                    userId
                });
            } else if (receiverId) {
                socket.to(`user:${receiverId}`).emit('stop_typing', {
                    chatId,
                    userId
                });
            }
        });

        // Handle message seen
        socket.on('message_seen', (data) => {
            const { chatId, receiverId, groupId } = data;

            if (groupId) {
                socket.to(`group:${groupId}`).emit('message_seen', {
                    chatId,
                    groupId,
                    userId,
                    name: socket.user.name
                });
            } else if (receiverId) {
                socket.to(`user:${receiverId}`).emit('message_seen', {
                    chatId,
                    userId
                });
            }
        });

        // Handle join group room
        socket.on('join_group', (groupId) => {
            socket.join(`group:${groupId}`);
            console.log(`User ${userId} joined group:${groupId}`);
        });

        // Handle leave group room
        socket.on('leave_group', (groupId) => {
            socket.leave(`group:${groupId}`);
            console.log(`User ${userId} left group:${groupId}`);
        });

        // Handle join chat room
        socket.on('join_chat', (chatId) => {
            socket.join(`chat:${chatId}`);
            console.log(`User ${userId} joined chat:${chatId}`);
        });

        // Handle leave chat room
        socket.on('leave_chat', (chatId) => {
            socket.leave(`chat:${chatId}`);
            console.log(`User ${userId} left chat:${chatId}`);
        });

        // Handle get online users
        socket.on('get_online_users', () => {
            socket.emit('online_users', Array.from(onlineUsers.keys()));
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`🔌 User disconnected: ${socket.user.name} (${userId})`);
            onlineUsers.delete(userId);

            // Broadcast offline status
            socket.broadcast.emit('user_offline', {
                userId,
                name: socket.user.name
            });
        });
    });

    return io;
};

/**
 * Check if user is online
 */
const isUserOnline = (userId) => {
    return onlineUsers.has(userId);
};

/**
 * Get online users list
 */
const getOnlineUsers = () => {
    return Array.from(onlineUsers.keys());
};

/**
 * Send notification to specific user
 */
const sendNotification = (io, userId, notification) => {
    io.to(`user:${userId}`).emit('notification', notification);
};

module.exports = {
    initializeSocket,
    isUserOnline,
    getOnlineUsers,
    sendNotification
};
