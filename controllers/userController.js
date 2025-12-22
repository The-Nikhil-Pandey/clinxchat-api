const UserService = require('../services/userService');

class UserController {

    /**
     * Register a new user
     * POST /api/users/register
     */
    static async register(req, res) {
        try {
            const { firstName, lastName, email, password, phone } = req.body;

            // Call service to register user
            const user = await UserService.registerUser({
                firstName,
                lastName,
                email,
                password,
                phone
            });

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: user
            });

        } catch (error) {
            console.error('Registration error:', error);

            // Handle known errors with status codes
            if (error.statusCode) {
                return res.status(error.statusCode).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Internal server error. Please try again later.'
            });
        }
    }

    /**
     * Get all users
     * GET /api/users
     */
    static async getAllUsers(req, res) {
        try {
            const users = await UserService.getAllUsers();

            res.status(200).json({
                success: true,
                message: 'Users retrieved successfully',
                count: users.length,
                data: users
            });

        } catch (error) {
            console.error('Get users error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error. Please try again later.'
            });
        }
    }

    /**
     * Get user by ID
     * GET /api/users/:id
     */
    static async getUserById(req, res) {
        try {
            const { id } = req.params;
            const user = await UserService.findById(id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'User retrieved successfully',
                data: user
            });

        } catch (error) {
            console.error('Get user error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error. Please try again later.'
            });
        }
    }

    /**
     * Update user by ID
     * PUT /api/users/:id
     */
    static async updateUser(req, res) {
        try {
            const { id } = req.params;
            const { firstName, lastName, phone } = req.body;

            // Check if user exists
            const existingUser = await UserService.findById(id);
            if (!existingUser) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Update user
            const updated = await UserService.updateUser(id, {
                firstName,
                lastName,
                phone
            });

            if (updated) {
                const updatedUser = await UserService.findById(id);
                res.status(200).json({
                    success: true,
                    message: 'User updated successfully',
                    data: updatedUser
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to update user'
                });
            }

        } catch (error) {
            console.error('Update user error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error. Please try again later.'
            });
        }
    }

    /**
     * Delete user by ID (soft delete)
     * DELETE /api/users/:id
     */
    static async deleteUser(req, res) {
        try {
            const { id } = req.params;

            // Check if user exists
            const existingUser = await UserService.findById(id);
            if (!existingUser) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Soft delete user
            const deleted = await UserService.deleteUser(id);

            if (deleted) {
                res.status(200).json({
                    success: true,
                    message: 'User deleted successfully'
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to delete user'
                });
            }

        } catch (error) {
            console.error('Delete user error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error. Please try again later.'
            });
        }
    }
}

module.exports = UserController;
