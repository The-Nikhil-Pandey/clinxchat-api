const express = require('express');
const router = express.Router();
const GroupController = require('../controllers/groupController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Group CRUD
router.get('/', GroupController.getUserGroups);
router.get('/mandatory', GroupController.getMandatoryGroups);
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
router.get('/:id/messages', GroupController.getMessages);

// Group media
router.get('/:groupId/media', GroupController.getGroupMedia);

// Invite links
router.post('/:id/invite', GroupController.createInvite);
router.get('/:id/invite', GroupController.listInvites);
router.delete('/:id/invite/:inviteId', GroupController.deleteInvite);

// Join request / approval flow
router.post('/:id/join-request', GroupController.joinRequest);
router.get('/:id/requests', GroupController.listJoinRequests);
router.post('/:id/requests/:requestId/approve', GroupController.approveJoinRequest);
router.post('/:id/requests/:requestId/reject', GroupController.rejectJoinRequest);

// Join by invite token
router.post('/join/:token', GroupController.joinByToken);

module.exports = router;

