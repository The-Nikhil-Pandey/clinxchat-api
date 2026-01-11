const jwt = require('jsonwebtoken');
const { pool, queryWithRetry } = require('../config/db');

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
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Decoded token in auth middleware:', decoded);

        // Get user from database (use queryWithRetry to handle transient DB errors)
        const [rows] = await require('../config/db').queryWithRetry(
            `SELECT id, name, email, role, department, profile_picture, active_status, is_active 
             FROM users WHERE id = ?`,
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
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            profile_picture: user.profile_picture,
            active_status: user.active_status
        };

        next();

    } catch (error) {
        console.error('Auth middleware error:', error);

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        // Handle DB transient errors more gracefully
        const transientCodes = ['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'];
        if (error && error.code && transientCodes.includes(error.code)) {
            return res.status(503).json({
                success: false,
                message: 'Database connection error, please try again shortly'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

/**
 * Admin only middleware
 */
const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }
    next();
};

module.exports = { authenticate, adminOnly };
