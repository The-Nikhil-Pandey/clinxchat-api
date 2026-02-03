const express = require('express');
const router = express.Router();
const BlockController = require('../controllers/blockController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Get all blocked users
router.get('/', BlockController.getBlockedUsers);

// Check block status with a specific user
router.get('/status/:userId', BlockController.getBlockStatus);

// Block a user
router.post('/:userId', BlockController.blockUser);

// Unblock a user
router.delete('/:userId', BlockController.unblockUser);

module.exports = router;
