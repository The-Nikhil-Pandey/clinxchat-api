const express = require('express');
const router = express.Router();
const TeamController = require('../controllers/teamController');
const InviteController = require('../controllers/inviteController');
const { authenticate } = require('../middleware/auth');
const { loadTeamContext, requireTeamAdmin, verifyTeamMembership, verifyTeamAdmin } = require('../middleware/teamAuth');

// All routes require authentication
router.use(authenticate);
router.use(loadTeamContext);

// Team CRUD
router.post('/', TeamController.create);
router.get('/', TeamController.getMyTeams);
router.get('/:id', TeamController.getById);
router.put('/:id', verifyTeamAdmin, TeamController.update);
router.delete('/:id', verifyTeamAdmin, TeamController.delete);

// Team members
router.get('/:id/members', verifyTeamMembership, TeamController.getMembers);
router.delete('/:id/members/:userId', verifyTeamAdmin, TeamController.removeMember);
router.put('/:id/members/:userId', verifyTeamAdmin, TeamController.updateMemberRole);

// Team switch
router.post('/:id/switch', TeamController.switchTeam);

// Team stats (admin only)
router.get('/:id/stats', verifyTeamAdmin, TeamController.getStats);

// Team invites
router.post('/:id/invites', verifyTeamAdmin, InviteController.create);
router.get('/:id/invites', verifyTeamAdmin, InviteController.getPending);

module.exports = router;
