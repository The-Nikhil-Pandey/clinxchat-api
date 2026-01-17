const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Profile routes (must be before /:id)
router.get('/profile', UserController.getProfile);
router.put('/profile/settings', UserController.updateSettings);

// Device routes
router.get('/devices', UserController.getDevices);
router.post('/devices', UserController.registerDevice);
router.delete('/devices/:id', UserController.removeDevice);

// Search users (must be before /:id)
router.get('/search', UserController.search);

// User CRUD
router.get('/', UserController.getAll);
router.get('/:id', UserController.getById);
router.put('/:id', UserController.update);
router.put('/:id/status', UserController.updateStatus);
router.delete('/:id', UserController.delete);

module.exports = router;

