const AuthService = require('../services/authService');
const { pool } = require('../config/db');

/**
 * Authentication middleware to protect routes
 */
const authenticate = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        const token = authHeader.split(' ')[1];

        // Verify token
        const decoded = AuthService.verifyToken(token);

        // Get user from database
        const [rows] = await pool.query(
            'SELECT id, first_name, last_name, email, phone, is_active FROM users WHERE id = ?',
            [decoded.id]
        );

        const user = rows[0];

        if (!user || !user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'User not found or inactive'
            });
        }

        // Attach user to request
        req.user = {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            phone: user.phone
        };

        next();

    } catch (error) {
        console.error('Auth middleware error:', error);

        if (error.statusCode === 401) {
            return res.status(401).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

module.exports = { authenticate };
