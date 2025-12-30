const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Search users (must be before /:id)
router.get('/search', UserController.search);

// User CRUD
router.get('/', UserController.getAll);
router.get('/:id', UserController.getById);
router.put('/:id', UserController.update);
router.put('/:id/status', UserController.updateStatus);
router.delete('/:id', UserController.delete);

module.exports = router;
