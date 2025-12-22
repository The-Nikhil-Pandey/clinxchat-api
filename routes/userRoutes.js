const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { registerValidation } = require('../middleware/validation');
const { handleValidationErrors } = require('../middleware/errorHandler');

// POST /api/users/register - Register a new user
router.post('/register', registerValidation, handleValidationErrors, UserController.register);

// GET /api/users - Get all users
router.get('/', UserController.getAllUsers);

// GET /api/users/:id - Get user by ID
router.get('/:id', UserController.getUserById);

// PUT /api/users/:id - Update user by ID
router.put('/:id', UserController.updateUser);

// DELETE /api/users/:id - Delete user by ID (soft delete)
router.delete('/:id', UserController.deleteUser);

module.exports = router;
