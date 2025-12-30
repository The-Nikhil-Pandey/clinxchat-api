const express = require('express');
const router = express.Router();
const UploadController = require('../controllers/uploadController');
const { authenticate } = require('../middleware/auth');
const { uploadUserProfile, uploadChatMedia, uploadGroupImage } = require('../config/multerConfig');

// All routes require authentication
router.use(authenticate);

// Upload routes
router.post('/user-profile', uploadUserProfile.single('file'), UploadController.uploadUserProfile);
router.post('/chat-media', uploadChatMedia.single('file'), UploadController.uploadChatMedia);
router.post('/group-image', uploadGroupImage.single('file'), UploadController.uploadGroupImage);

module.exports = router;
