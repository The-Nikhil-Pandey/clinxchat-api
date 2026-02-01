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
router.get('/:chatId/messages/search', ChatController.searchMessages);
router.get('/:chatId/media', ChatController.getChatMedia);
// Message deletion
router.delete('/messages/:messageId/everyone', ChatController.deleteForEveryone);
router.delete('/messages/:messageId/me', ChatController.deleteForMe);
router.delete('/messages/bulk/everyone', ChatController.bulkDeleteMessagesForEveryone);
router.delete('/messages/bulk/me', ChatController.bulkDeleteMessagesForMe);
router.delete('/:chatId/clear', ChatController.clearChat);

// Bulk operations
router.put('/bulk/favorite', ChatController.bulkFavorite);
router.put('/bulk/archive', ChatController.bulkArchive);
router.put('/bulk/pin', ChatController.bulkPin);
router.delete('/bulk/delete', ChatController.bulkDelete);

module.exports = router;
