const express = require('express');
const router = express.Router();
const ChatController = require('../controllers/chatController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Chat list
router.get('/', ChatController.getAll);

// Private chat operations
router.get('/private/:userId', ChatController.getPrivateChat);
router.post('/private/send', ChatController.sendPrivateMessage);

// Chat message operations
router.get('/:chatId/messages', ChatController.getMessages);
router.get('/:chatId/media', ChatController.getChatMedia);
router.put('/:chatId/seen', ChatController.markAsSeen);

module.exports = router;
