const express = require('express');
const router = express.Router();
const ContactController = require('../controllers/contactController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Search contacts (must be before other routes)
router.get('/search', ContactController.search);

// Contact operations
router.get('/', ContactController.getAll);
router.post('/', ContactController.add);
router.delete('/:userId', ContactController.remove);

module.exports = router;
