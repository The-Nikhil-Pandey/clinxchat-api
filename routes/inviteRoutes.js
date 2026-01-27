const express = require('express');
const router = express.Router();
const InviteController = require('../controllers/inviteController');
const { authenticate } = require('../middleware/auth');

// Public route - validate invite token (no auth required)
router.get('/validate/:token', InviteController.validate);

// Protected routes
router.use(authenticate);

// Get pending invites for current user
router.get('/me', InviteController.getMyPendingInvites);

// Accept invite (requires auth)
router.post('/accept', InviteController.accept);

// Delete invite
router.delete('/:id', InviteController.delete);

// Resend invite
router.post('/:id/resend', InviteController.resend);

module.exports = router;
