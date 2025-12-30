const express = require('express');
const router = express.Router();
const GroupController = require('../controllers/groupController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Group CRUD
router.get('/', GroupController.getUserGroups);
router.post('/', GroupController.create);
router.get('/:id', GroupController.getById);
router.put('/:id', GroupController.update);
router.delete('/:id', GroupController.delete);

// Group members
router.post('/:id/members', GroupController.addMember);
router.put('/:id/members/:userId', GroupController.updateMemberRole);
router.delete('/:id/members/:userId', GroupController.removeMember);

// Group permissions
router.get('/:id/permissions', GroupController.getPermissions);
router.put('/:id/permissions', GroupController.updatePermissions);

// Group messages
router.post('/:id/messages', GroupController.sendMessage);

// Group media
router.get('/:groupId/media', GroupController.getGroupMedia);

module.exports = router;
