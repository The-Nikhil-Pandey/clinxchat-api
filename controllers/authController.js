const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const OtpModel = require('../models/otpModel');
const { sendOtpEmail, generateOtp } = require('../config/email');

/**
 * Auth Controller - Handles authentication operations with OTP verification
 */
class AuthController {

    /**
     * Step 1: Initiate Registration - Send OTP to email
     * POST /api/auth/register/initiate
     */
    static async initiateRegistration(req, res) {
        try {
            const { name, email, password } = req.body;

            // Validate required fields
            if (!name || !email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Name, email and password are required'
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid email address'
                });
            }

            // Validate password (min 8 chars, must contain letters and numbers)
            if (password.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 8 characters long'
                });
            }

            const hasLetters = /[a-zA-Z]/.test(password);
            const hasNumbers = /[0-9]/.test(password);

            if (!hasLetters || !hasNumbers) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must contain both letters and numbers'
                });
            }

            // Check if email already exists
            const emailExists = await UserModel.emailExists(email);
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already registered'
                });
            }

            // Generate OTP (5 digits)
            const otp = generateOtp(5);

            // Save OTP to database
            await OtpModel.create(email, otp, 5); // 5 minutes expiry

            // Send OTP via email
            await sendOtpEmail(email, otp);

            res.status(200).json({
                success: true,
                message: 'OTP sent to your email',
                data: {
                    email,
                    expiresIn: 300 // 5 minutes in seconds
                }
            });
        } catch (error) {
            console.error('Initiate registration error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send OTP',
                error: error.message
            });
        }
    }

    /**
     * Step 2: Verify OTP and Complete Registration
     * POST /api/auth/register/verify-otp
     */
    static async verifyOtpAndRegister(req, res) {
        try {
            const { name, email, password, otp, role, department } = req.body;

            // Validate required fields
            if (!email || !otp || !name || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Email, OTP, name and password are required'
                });
            }

            // Verify OTP
            const otpResult = await OtpModel.verify(email, otp);
            if (!otpResult.valid) {
                return res.status(400).json({
                    success: false,
                    message: otpResult.message
                });
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Create user (but profile not completed yet)
            const user = await UserModel.create({
                name,
                email,
                hashedPassword,
                role: role || 'clinical_staff',
                department
            });

            // Generate token
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
            );

            // Clean up OTP
            await OtpModel.deleteByEmail(email);

            res.status(201).json({
                success: true,
                message: 'Email verified successfully',
                data: {
                    user,
                    token,
                    profileCompleted: false // Frontend will redirect to profile completion
                }
            });
        } catch (error) {
            console.error('Verify OTP error:', error);
            res.status(500).json({
                success: false,
                message: 'Verification failed',
                error: error.message
            });
        }
    }

    /**
     * Resend OTP
     * POST /api/auth/register/resend-otp
     */
    static async resendOtp(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is required'
                });
            }

            // Generate new OTP
            const otp = generateOtp(5);

            // Save OTP to database (this will delete old OTP)
            await OtpModel.create(email, otp, 5);

            // Send OTP via email
            await sendOtpEmail(email, otp);

            res.status(200).json({
                success: true,
                message: 'OTP resent successfully',
                data: {
                    email,
                    expiresIn: 300
                }
            });
        } catch (error) {
            console.error('Resend OTP error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to resend OTP',
                error: error.message
            });
        }
    }

    /**
     * Legacy register (for backward compatibility)
     * POST /api/auth/register
     */
    static async register(req, res) {
        try {
            const { name, email, password, role, department } = req.body;

            // Validate required fields
            if (!name || !email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Name, email and password are required'
                });
            }

            // Validate password (min 8 chars, must contain letters and numbers)
            if (password.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 8 characters long'
                });
            }

            const hasLetters = /[a-zA-Z]/.test(password);
            const hasNumbers = /[0-9]/.test(password);

            if (!hasLetters || !hasNumbers) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must contain both letters and numbers'
                });
            }

            // Check if email exists
            const emailExists = await UserModel.emailExists(email);
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already registered'
                });
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Create user
            const user = await UserModel.create({
                name,
                email,
                hashedPassword,
                role: role || 'clinical_staff',
                department
            });

            // Generate token
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
            );

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: {
                    user,
                    token
                }
            });
        } catch (error) {
            console.error('Register error:', error);
            res.status(500).json({
                success: false,
                message: 'Registration failed',
                error: error.message
            });
        }
    }

    /**
     * Login user
     * POST /api/auth/login
     */
    static async login(req, res) {
        try {
            const { email, password } = req.body;

            // Validate
            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Email and password are required'
                });
            }

            // Find user
            const user = await UserModel.findByEmail(email);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
            }

            // Check password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
            }

            // Generate token
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
            );

            // Remove password from response
            const { password: _, ...userWithoutPassword } = user;

            res.status(200).json({
                success: true,
                message: 'Login successful',
                data: {
                    user: userWithoutPassword,
                    token
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                message: 'Login failed',
                error: error.message
            });
        }
    }

    /**
     * Logout user
     * POST /api/auth/logout
     */
    static async logout(req, res) {
        try {
            res.status(200).json({
                success: true,
                message: 'Logged out successfully'
            });
        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({
                success: false,
                message: 'Logout failed',
                error: error.message
            });
        }
    }

    /**
     * Get current user profile
     * GET /api/auth/me
     */
    static async me(req, res) {
        try {
            const user = await UserModel.findById(req.user.id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Get user's current team and teams list
            const { pool } = require('../config/db');
            const TeamModel = require('../models/teamModel');

            let currentTeam = null;
            let teamRole = null;
            let teams = [];

            // Get user's current_team_id
            const [userRows] = await pool.query(
                `SELECT current_team_id FROM users WHERE id = ?`,
                [req.user.id]
            );

            const currentTeamId = userRows[0]?.current_team_id;

            if (currentTeamId) {
                currentTeam = await TeamModel.findById(currentTeamId);
                teamRole = await TeamModel.getUserRole(currentTeamId, req.user.id);
            }

            // Get all teams user belongs to
            teams = await TeamModel.findByUserId(req.user.id);

            res.status(200).json({
                success: true,
                data: {
                    ...user,
                    current_team: currentTeam,
                    team_role: teamRole,
                    teams: teams,
                    has_team: teams.length > 0
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
     * Change password
     * POST /api/auth/change-password
     */
    static async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password and new password are required'
                });
            }

            // Validate new password
            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'New password must be at least 8 characters long'
                });
            }

            const hasLetters = /[a-zA-Z]/.test(newPassword);
            const hasNumbers = /[0-9]/.test(newPassword);

            if (!hasLetters || !hasNumbers) {
                return res.status(400).json({
                    success: false,
                    message: 'New password must contain both letters and numbers'
                });
            }

            // Get user with password
            const user = await UserModel.findByIdWithPassword(req.user.id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Verify current password
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            // Hash new password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            // Update password
            await UserModel.updatePassword(req.user.id, hashedPassword);

            res.status(200).json({
                success: true,
                message: 'Password changed successfully'
            });
        } catch (error) {
            console.error('Change password error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to change password',
                error: error.message
            });
        }
    }

    /**
     * Forgot Password - Send OTP to email
     * POST /api/auth/forgot-password
     */
    static async forgotPassword(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is required'
                });
            }

            // Check if user exists
            const user = await UserModel.findByEmail(email);
            if (!user) {
                // For security, don't reveal if email exists
                return res.status(200).json({
                    success: true,
                    message: 'If this email exists, a reset code has been sent'
                });
            }

            // Generate OTP
            const otp = generateOtp(5);

            // Save OTP to database
            await OtpModel.create(email, otp, 10); // 10 minutes expiry for password reset

            // Send OTP via email
            await sendOtpEmail(email, otp, 'Password Reset');

            res.status(200).json({
                success: true,
                message: 'Reset code sent to your email',
                data: {
                    email,
                    expiresIn: 600 // 10 minutes
                }
            });
        } catch (error) {
            console.error('Forgot password error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send reset code',
                error: error.message
            });
        }
    }

    /**
     * Verify Reset OTP - Check if OTP is valid before allowing password reset
     * POST /api/auth/verify-reset-otp
     */
    static async verifyResetOtp(req, res) {
        try {
            const { email, otp } = req.body;

            if (!email || !otp) {
                return res.status(400).json({
                    success: false,
                    message: 'Email and OTP are required'
                });
            }

            // Verify OTP
            const otpResult = await OtpModel.verify(email, otp);
            if (!otpResult.valid) {
                return res.status(400).json({
                    success: false,
                    message: otpResult.message
                });
            }

            res.status(200).json({
                success: true,
                message: 'OTP verified successfully'
            });
        } catch (error) {
            console.error('Verify reset OTP error:', error);
            res.status(500).json({
                success: false,
                message: 'Verification failed',
                error: error.message
            });
        }
    }

    /**
     * Reset Password - Verify OTP and set new password
     * POST /api/auth/reset-password
     */
    static async resetPassword(req, res) {
        try {
            const { email, otp, newPassword } = req.body;

            if (!email || !otp || !newPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Email, OTP and new password are required'
                });
            }

            // Validate new password
            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 8 characters long'
                });
            }

            const hasLetters = /[a-zA-Z]/.test(newPassword);
            const hasNumbers = /[0-9]/.test(newPassword);

            if (!hasLetters || !hasNumbers) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must contain both letters and numbers'
                });
            }

            // Check if user exists
            const user = await UserModel.findByEmail(email);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Verify OTP (allow verified since it was checked in the previous step)
            const otpResult = await OtpModel.verify(email, otp, true);
            if (!otpResult.valid) {
                return res.status(400).json({
                    success: false,
                    message: otpResult.message
                });
            }

            // Hash new password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            // Update password
            await UserModel.updatePassword(user.id, hashedPassword);

            // Clean up OTP
            await OtpModel.deleteByEmail(email);

            res.status(200).json({
                success: true,
                message: 'Password reset successfully. Please login with your new password.'
            });
        } catch (error) {
            console.error('Reset password error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to reset password',
                error: error.message
            });
        }
    }
}

module.exports = AuthController;
