const express = require('express');
const router = express.Router();
const SettingsController = require('../controllers/settingsController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Get user settings
router.get('/', SettingsController.get);

// Update user settings
router.put('/', SettingsController.update);

module.exports = router;
