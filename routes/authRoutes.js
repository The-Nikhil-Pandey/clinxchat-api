const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Public routes - OTP flow
router.post('/register/initiate', AuthController.initiateRegistration);
router.post('/register/verify-otp', AuthController.verifyOtpAndRegister);
router.post('/register/resend-otp', AuthController.resendOtp);

// Legacy register (backward compatibility)
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);

// Forgot Password flow
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/verify-reset-otp', AuthController.verifyResetOtp);
router.post('/reset-password', AuthController.resetPassword);

// Protected routes
router.post('/logout', authenticate, AuthController.logout);
router.get('/me', authenticate, AuthController.me);
router.post('/change-password', authenticate, AuthController.changePassword);

module.exports = router;
