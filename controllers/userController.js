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
            const requestedId = parseInt(req.params.id);
            const requesterId = req.user.id;

            const user = await UserModel.findById(requestedId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Privacy Logic
            let maskedUser = { ...user };

            // 1. Online status visibility
            if (!user.online_visibility && requestedId !== requesterId) {
                maskedUser.active_status = null;
            }

            // 2. Profile visibility
            if (requestedId !== requesterId) {
                const { pool } = require('../config/db');

                // Check if they are contacts
                const [contactRows] = await pool.query(
                    `SELECT id FROM contacts 
                     WHERE (user_id = ? AND contact_user_id = ?) 
                        OR (user_id = ? AND contact_user_id = ?)`,
                    [requesterId, requestedId, requestedId, requesterId]
                );
                const isContact = contactRows.length > 0;

                const visibility = user.profile_visibility || 'everyone';

                if (visibility === 'nobody') {
                    // Minimal data
                    maskedUser = {
                        id: user.id,
                        name: user.name,
                        profile_picture: user.profile_picture,
                        role: user.role,
                        is_restricted: true
                    };
                } else if (visibility === 'contacts' && !isContact) {
                    // Minimal data
                    maskedUser = {
                        id: user.id,
                        name: user.name,
                        profile_picture: user.profile_picture,
                        role: user.role,
                        is_restricted: true
                    };
                }
            }

            res.status(200).json({
                success: true,
                data: maskedUser
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
     * Team-scoped: Returns only users in the same team
     */
    static async getAll(req, res) {
        try {
            const { pool } = require('../config/db');

            // Get user's current team
            const [userRows] = await pool.query(
                `SELECT current_team_id FROM users WHERE id = ?`,
                [req.user.id]
            );

            const teamId = userRows[0]?.current_team_id;

            if (!teamId) {
                // No team - return empty or just the current user
                return res.status(200).json({
                    success: true,
                    data: [],
                    message: 'Join or create a team to see other users'
                });
            }

            // Get team members only
            const [users] = await pool.query(
                `SELECT u.id, u.name, u.email, u.role, u.department, u.profile_picture, 
                        u.active_status, u.online_visibility, u.created_at, tm.role as team_role
                 FROM users u
                 JOIN team_members tm ON u.id = tm.user_id
                 WHERE tm.team_id = ? AND u.is_active = TRUE AND u.id != ?
                 ORDER BY u.name ASC`,
                [teamId, req.user.id]
            );

            // Respect online_visibility
            const maskedUsers = users.map(u => ({
                ...u,
                active_status: u.online_visibility ? u.active_status : null,
                online_visibility: undefined // Remove from output
            }));

            res.status(200).json({
                success: true,
                data: maskedUsers
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
     * Team-scoped: Searches only within the user's current team
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

            const { pool } = require('../config/db');

            // Get user's current team
            const [userRows] = await pool.query(
                `SELECT current_team_id FROM users WHERE id = ?`,
                [req.user.id]
            );

            const teamId = userRows[0]?.current_team_id;

            if (!teamId) {
                return res.status(200).json({
                    success: true,
                    data: [],
                    message: 'Join or create a team to search users'
                });
            }

            // Search within team only
            const searchPattern = `%${query}%`;
            const [users] = await pool.query(
                `SELECT u.id, u.name, u.email, u.role, u.department, u.profile_picture, 
                        u.active_status, u.online_visibility, tm.role as team_role
                 FROM users u
                 JOIN team_members tm ON u.id = tm.user_id
                 WHERE tm.team_id = ? 
                   AND u.is_active = TRUE 
                   AND u.id != ?
                   AND (u.name LIKE ? OR u.email LIKE ?)
                 ORDER BY u.name ASC
                 LIMIT 50`,
                [teamId, req.user.id, searchPattern, searchPattern]
            );

            // Respect online_visibility
            const maskedUsers = users.map(u => ({
                ...u,
                active_status: u.online_visibility ? u.active_status : null,
                online_visibility: undefined
            }));

            res.status(200).json({
                success: true,
                data: maskedUsers
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

    /**
     * Get current user's profile (full details)
     * GET /api/users/profile
     */
    static async getProfile(req, res) {
        try {
            const user = await UserModel.findById(req.user.id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Get user's devices
            const devices = await UserModel.getDevices(req.user.id);

            res.status(200).json({
                success: true,
                data: {
                    ...user,
                    devices
                }
            });
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get profile',
                error: error.message
            });
        }
    }

    /**
     * Update user profile settings
     * PUT /api/users/profile/settings
     */
    static async updateSettings(req, res) {
        try {
            const {
                active_status,
                profile_visibility,
                read_receipts,
                online_visibility,
                two_factor_enabled
            } = req.body;

            const updated = await UserModel.updateSettings(req.user.id, {
                active_status,
                profile_visibility,
                read_receipts,
                online_visibility,
                two_factor_enabled
            });

            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const user = await UserModel.findById(req.user.id);
            res.status(200).json({
                success: true,
                message: 'Settings updated successfully',
                data: user
            });
        } catch (error) {
            console.error('Update settings error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update settings',
                error: error.message
            });
        }
    }

    /**
     * Get user's connected devices
     * GET /api/users/devices
     */
    static async getDevices(req, res) {
        try {
            const devices = await UserModel.getDevices(req.user.id);
            res.status(200).json({
                success: true,
                data: devices
            });
        } catch (error) {
            console.error('Get devices error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get devices',
                error: error.message
            });
        }
    }

    /**
     * Register/update device
     * POST /api/users/devices
     */
    static async registerDevice(req, res) {
        try {
            const { device_name, device_type, push_token } = req.body;

            if (!device_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Device name is required'
                });
            }

            const device = await UserModel.registerDevice(req.user.id, {
                device_name,
                device_type: device_type || 'phone',
                push_token
            });

            res.status(200).json({
                success: true,
                message: 'Device registered successfully',
                data: device
            });
        } catch (error) {
            console.error('Register device error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to register device',
                error: error.message
            });
        }
    }

    /**
     * Remove device
     * DELETE /api/users/devices/:id
     */
    static async removeDevice(req, res) {
        try {
            const deviceId = parseInt(req.params.id);
            const removed = await UserModel.removeDevice(req.user.id, deviceId);

            if (!removed) {
                return res.status(404).json({
                    success: false,
                    message: 'Device not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Device removed successfully'
            });
        } catch (error) {
            console.error('Remove device error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to remove device',
                error: error.message
            });
        }
    }
}

module.exports = UserController;
