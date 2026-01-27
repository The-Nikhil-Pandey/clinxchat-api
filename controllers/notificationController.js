const NotificationModel = require('../models/notificationModel');

/**
 * Notification Controller - Handles notification operations
 */
class NotificationController {

    /**
     * Get all notifications
     * GET /api/notifications
     */
    static async getAll(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;

            const notifications = await NotificationModel.findByUserId(req.user.id, limit, offset);
            const unreadCount = await NotificationModel.getUnreadCount(req.user.id);

            res.status(200).json({
                success: true,
                data: {
                    notifications,
                    unreadCount
                }
            });
        } catch (error) {
            console.error('Get notifications error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get notifications',
                error: error.message
            });
        }
    }

    /**
     * Mark notification as read
     * PUT /api/notifications/:id/read
     */
    static async markAsRead(req, res) {
        try {
            const notificationId = parseInt(req.params.id);

            const marked = await NotificationModel.markAsRead(notificationId, req.user.id);
            if (!marked) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found'
                });
            }

            // Emit socket event for real-time sync across devices
            if (req.app.get('io')) {
                const unreadCount = await NotificationModel.getUnreadCount(req.user.id);
                req.app.get('io').to(`user:${req.user.id}`).emit('notification_read', {
                    notificationId,
                    unreadCount
                });
            }

            res.status(200).json({
                success: true,
                message: 'Notification marked as read'
            });

        } catch (error) {
            console.error('Mark as read error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark notification as read',
                error: error.message
            });
        }
    }

    /**
     * Mark all notifications as read
     * PUT /api/notifications/read-all
     */
    static async markAllAsRead(req, res) {
        try {
            const count = await NotificationModel.markAllAsRead(req.user.id);

            // Emit socket event for real-time sync across devices
            if (req.app.get('io')) {
                req.app.get('io').to(`user:${req.user.id}`).emit('notification_read', {
                    all: true,
                    unreadCount: 0
                });
            }

            res.status(200).json({
                success: true,
                message: `${count} notifications marked as read`
            });

        } catch (error) {
            console.error('Mark all as read error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark notifications as read',
                error: error.message
            });
        }
    }

    /**
     * Delete notification
     * DELETE /api/notifications/:id
     */
    static async delete(req, res) {
        try {
            const notificationId = parseInt(req.params.id);

            const deleted = await NotificationModel.delete(notificationId, req.user.id);
            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Notification deleted'
            });
        } catch (error) {
            console.error('Delete notification error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete notification',
                error: error.message
            });
        }
    }
}

module.exports = NotificationController;
