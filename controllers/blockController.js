const BlockModel = require('../models/blockModel');
const UserModel = require('../models/userModel');

/**
 * Block Controller - Handle user blocking operations
 */
class BlockController {
    /**
     * Block a user
     * POST /api/blocks/:userId
     */
    static async blockUser(req, res) {
        try {
            const blockerId = req.user.id;
            const blockedId = parseInt(req.params.userId);

            if (blockerId === blockedId) {
                return res.status(400).json({
                    success: false,
                    message: 'You cannot block yourself'
                });
            }

            // Check if user exists
            const user = await UserModel.findById(blockedId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            await BlockModel.block(blockerId, blockedId);

            res.status(200).json({
                success: true,
                message: 'User blocked successfully'
            });
        } catch (error) {
            console.error('Block user error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to block user',
                error: error.message
            });
        }
    }

    /**
     * Unblock a user
     * DELETE /api/blocks/:userId
     */
    static async unblockUser(req, res) {
        try {
            const blockerId = req.user.id;
            const blockedId = parseInt(req.params.userId);

            const unblocked = await BlockModel.unblock(blockerId, blockedId);

            if (!unblocked) {
                return res.status(404).json({
                    success: false,
                    message: 'Block not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'User unblocked successfully'
            });
        } catch (error) {
            console.error('Unblock user error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to unblock user',
                error: error.message
            });
        }
    }

    /**
     * Get all blocked users
     * GET /api/blocks
     */
    static async getBlockedUsers(req, res) {
        try {
            const userId = req.user.id;
            const blockedUsers = await BlockModel.getBlockedByUser(userId);

            res.status(200).json({
                success: true,
                data: blockedUsers
            });
        } catch (error) {
            console.error('Get blocked users error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get blocked users',
                error: error.message
            });
        }
    }

    /**
     * Check block status with a user
     * GET /api/blocks/status/:userId
     */
    static async getBlockStatus(req, res) {
        try {
            const userId = req.user.id;
            const otherUserId = parseInt(req.params.userId);

            const status = await BlockModel.getBlockStatus(userId, otherUserId);

            res.status(200).json({
                success: true,
                data: status
            });
        } catch (error) {
            console.error('Get block status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get block status',
                error: error.message
            });
        }
    }
}

module.exports = BlockController;
