const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/errorHandler');

// Login validation
const loginValidation = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address'),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

// POST /api/auth/login - User login
router.post('/login', loginValidation, handleValidationErrors, AuthController.login);

// GET /api/auth/profile - Get current user profile (protected)
router.get('/profile', authenticate, AuthController.getProfile);

// POST /api/auth/change-password - Change password (protected)
router.post('/change-password', authenticate, AuthController.changePassword);

module.exports = router;
