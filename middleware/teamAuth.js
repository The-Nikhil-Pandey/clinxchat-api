const TeamModel = require('../models/teamModel');

/**
 * Team Authentication Middleware
 * Provides team-scoped access control and RBAC
 */

/**
 * Load team context into request
 * Adds req.team and req.teamRole if user has a current_team_id
 */
const loadTeamContext = async (req, res, next) => {
    try {
        if (!req.user) {
            return next();
        }

        // Check if user has a current team set
        const userId = req.user.id;

        // Get user's current team from database
        const { pool } = require('../config/db');
        const [userRows] = await pool.query(
            `SELECT current_team_id FROM users WHERE id = ?`,
            [userId]
        );

        const currentTeamId = userRows[0]?.current_team_id;

        if (currentTeamId) {
            const team = await TeamModel.findById(currentTeamId);
            const role = await TeamModel.getUserRole(currentTeamId, userId);

            if (team && role) {
                req.team = team;
                req.teamRole = role;
                req.teamId = currentTeamId;
            }
        }

        next();
    } catch (error) {
        console.error('loadTeamContext error:', error);
        next(); // Continue without team context
    }
};

/**
 * Require user to have a team
 * Use after authenticate middleware
 */
const requireTeam = (req, res, next) => {
    if (!req.team || !req.teamId) {
        return res.status(403).json({
            success: false,
            message: 'Team membership required',
            code: 'NO_TEAM'
        });
    }
    next();
};

/**
 * Require specific team roles
 * @param {string[]} roles - Array of allowed roles (e.g., ['owner', 'admin'])
 */
const requireTeamRole = (roles) => {
    return (req, res, next) => {
        if (!req.teamRole) {
            return res.status(403).json({
                success: false,
                message: 'Team membership required'
            });
        }

        if (!roles.includes(req.teamRole)) {
            return res.status(403).json({
                success: false,
                message: `This action requires one of these roles: ${roles.join(', ')}`
            });
        }

        next();
    };
};

/**
 * Check if user is team admin (owner or admin)
 */
const requireTeamAdmin = (req, res, next) => {
    if (!req.teamRole) {
        return res.status(403).json({
            success: false,
            message: 'Team membership required'
        });
    }

    if (!['owner', 'admin'].includes(req.teamRole)) {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }

    next();
};

/**
 * Check if user is team owner
 */
const requireTeamOwner = (req, res, next) => {
    if (!req.teamRole) {
        return res.status(403).json({
            success: false,
            message: 'Team membership required'
        });
    }

    if (req.teamRole !== 'owner') {
        return res.status(403).json({
            success: false,
            message: 'Owner access required'
        });
    }

    next();
};

/**
 * Verify user belongs to a specific team (from params)
 * Useful for team-specific endpoints where teamId is in URL
 */
const verifyTeamMembership = async (req, res, next) => {
    try {
        const teamId = parseInt(req.params.teamId || req.params.id);

        if (!teamId) {
            return res.status(400).json({
                success: false,
                message: 'Team ID required'
            });
        }

        const isMember = await TeamModel.isMember(teamId, req.user.id);

        if (!isMember) {
            return res.status(403).json({
                success: false,
                message: 'You are not a member of this team'
            });
        }

        // Load team info into request
        const team = await TeamModel.findById(teamId);
        const role = await TeamModel.getUserRole(teamId, req.user.id);

        req.team = team;
        req.teamRole = role;
        req.teamId = teamId;

        next();
    } catch (error) {
        console.error('verifyTeamMembership error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify team membership'
        });
    }
};

/**
 * Verify user is admin of specific team (from params)
 */
const verifyTeamAdmin = async (req, res, next) => {
    try {
        const teamId = parseInt(req.params.teamId || req.params.id);

        if (!teamId) {
            return res.status(400).json({
                success: false,
                message: 'Team ID required'
            });
        }

        const isAdmin = await TeamModel.isAdmin(teamId, req.user.id);

        if (!isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required for this team'
            });
        }

        // Load team info
        const team = await TeamModel.findById(teamId);
        const role = await TeamModel.getUserRole(teamId, req.user.id);

        req.team = team;
        req.teamRole = role;
        req.teamId = teamId;

        next();
    } catch (error) {
        console.error('verifyTeamAdmin error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify admin access'
        });
    }
};

module.exports = {
    loadTeamContext,
    requireTeam,
    requireTeamRole,
    requireTeamAdmin,
    requireTeamOwner,
    verifyTeamMembership,
    verifyTeamAdmin
};
