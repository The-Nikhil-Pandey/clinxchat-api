const express = require('express');
const router = express.Router();
const ChannelController = require('../controllers/channelController');
const { authenticate } = require('../middleware/auth');
const { loadTeamContext, requireTeam, requireTeamAdmin } = require('../middleware/teamAuth');

// All routes require authentication and team context
router.use(authenticate);
router.use(loadTeamContext);
router.use(requireTeam);

// Channel CRUD
router.post('/', requireTeamAdmin, ChannelController.create);
router.get('/', ChannelController.getAll);
router.get('/:id', ChannelController.getById);
router.put('/:id', requireTeamAdmin, ChannelController.update);
router.delete('/:id', requireTeamAdmin, ChannelController.delete);

// Channel membership
router.post('/:id/join', ChannelController.join);
router.post('/:id/leave', ChannelController.leave);
router.get('/:id/members', ChannelController.getMembers);

// Channel messages
router.post('/:id/messages', ChannelController.sendMessage);
router.get('/:id/messages', ChannelController.getMessages);

module.exports = router;
