const UserModel = require('../models/userModel');

/**
 * User Controller - Handles user profile operations
 */
class UserController {

    /**
     * Get user by ID
     * GET /api/users/:id
     */
    static async getById(req, res) {
        try {
            const user = await UserModel.findById(req.params.id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            res.status(200).json({
                success: true,
                data: user
            });
        } catch (error) {
            console.error('Get user error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get user',
                error: error.message
            });
        }
    }

    /**
     * Get all users
     * GET /api/users
     */
    static async getAll(req, res) {
        try {
            const users = await UserModel.findAll();
            res.status(200).json({
                success: true,
                data: users
            });
        } catch (error) {
            console.error('Get all users error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get users',
                error: error.message
            });
        }
    }

    /**
     * Search users
     * GET /api/users/search?q=
     */
    static async search(req, res) {
        try {
            const query = req.query.q;
            if (!query) {
                return res.status(400).json({
                    success: false,
                    message: 'Search query is required'
                });
            }

            const users = await UserModel.search(query, req.user.id);
            res.status(200).json({
                success: true,
                data: users
            });
        } catch (error) {
            console.error('Search users error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to search users',
                error: error.message
            });
        }
    }

    /**
     * Update user profile
     * PUT /api/users/:id
     */
    static async update(req, res) {
        try {
            const userId = parseInt(req.params.id);

            // Users can only update their own profile
            if (userId !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only update your own profile'
                });
            }

            const { name, department } = req.body;
            const updated = await UserModel.update(userId, { name, department });

            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found or no changes made'
                });
            }

            const user = await UserModel.findById(userId);
            res.status(200).json({
                success: true,
                message: 'Profile updated successfully',
                data: user
            });
        } catch (error) {
            console.error('Update user error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update profile',
                error: error.message
            });
        }
    }

    /**
     * Update user status
     * PUT /api/users/:id/status
     */
    static async updateStatus(req, res) {
        try {
            const userId = parseInt(req.params.id);

            if (userId !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only update your own status'
                });
            }

            const { status } = req.body;
            const validStatuses = ['available', 'away', 'dnd'];

            if (!status || !validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status. Use: available, away, or dnd'
                });
            }

            const updated = await UserModel.updateStatus(userId, status);
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Status updated successfully',
                data: { status }
            });
        } catch (error) {
            console.error('Update status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update status',
                error: error.message
            });
        }
    }

    /**
     * Delete user (soft delete)
     * DELETE /api/users/:id
     */
    static async delete(req, res) {
        try {
            const userId = parseInt(req.params.id);

            // Only admins can delete other users
            if (userId !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'You are not authorized to delete this user'
                });
            }

            const deleted = await UserModel.softDelete(userId);
            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'User deleted successfully'
            });
        } catch (error) {
            console.error('Delete user error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete user',
                error: error.message
            });
        }
    }
}

module.exports = UserController;
