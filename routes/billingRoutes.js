const express = require('express');
const router = express.Router();
const BillingController = require('../controllers/billingController');
const { authenticate, adminOnly } = require('../middleware/auth');
const { loadTeamContext, requireTeam, requireTeamAdmin } = require('../middleware/teamAuth');

// Webhook endpoint - must be before body parser for raw body
router.post('/webhook', express.raw({ type: 'application/json' }), BillingController.handleWebhook);

// Protected routes
router.use(authenticate);

// Global Admin Route (No team context needed)
router.get('/all-payments', adminOnly, BillingController.getAllPayments);

router.use(loadTeamContext);
router.use(requireTeam);

// Get billing status
router.get('/status', BillingController.getStatus);

// Get payment history
router.get('/payments', BillingController.getPayments);

// Admin only operations
router.post('/checkout', requireTeamAdmin, BillingController.createCheckout);
router.get('/session-status/:sessionId', requireTeamAdmin, BillingController.checkSessionStatus);
router.post('/cancel', requireTeamAdmin, BillingController.cancelSubscription);

module.exports = router;
