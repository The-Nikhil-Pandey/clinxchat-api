const path = require('path');
const fs = require('fs');
const FileModel = require('../models/fileModel');
const UserModel = require('../models/userModel');
const { UPLOAD_PATH } = require('../config/multerConfig');

/**
 * Upload Controller - Handles file uploads
 */
class UploadController {

    /**
     * Upload user profile picture
     * POST /api/upload/user-profile
     */
    static async uploadUserProfile(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            const filePath = req.file.path.replace(/\\/g, '/');
            const relativePath = filePath.replace(UPLOAD_PATH.replace('./', ''), '');

            // Update user profile picture
            await UserModel.update(req.user.id, {
                profile_picture: relativePath
            });

            // Save file record
            await FileModel.create({
                userId: req.user.id,
                fileType: 'profile',
                filePath: relativePath,
                originalName: req.file.originalname,
                fileSize: req.file.size
            });

            res.status(200).json({
                success: true,
                message: 'Profile picture uploaded successfully',
                data: {
                    path: relativePath,
                    url: `/uploads${relativePath}`
                }
            });
        } catch (error) {
            console.error('Upload profile error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to upload profile picture',
                error: error.message
            });
        }
    }

    /**
     * Upload chat media
     * POST /api/upload/chat-media
     */
    static async uploadChatMedia(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            const chatId = req.body.chatId;
            if (!chatId) {
                // Delete the uploaded file
                fs.unlinkSync(req.file.path);
                return res.status(400).json({
                    success: false,
                    message: 'Chat ID is required'
                });
            }

            const filePath = req.file.path.replace(/\\/g, '/');
            const relativePath = filePath.replace(UPLOAD_PATH.replace('./', ''), '');

            // Determine file type
            let fileType = 'image';
            if (req.file.mimetype === 'application/pdf') {
                fileType = 'pdf';
            } else if (req.file.mimetype.startsWith('audio/')) {
                fileType = 'voice';
            } else if (req.file.mimetype.startsWith('video/')) {
                fileType = 'video';
            }

            // Save file record
            const file = await FileModel.create({
                userId: req.user.id,
                chatId: parseInt(chatId),
                fileType,
                filePath: relativePath,
                originalName: req.file.originalname,
                fileSize: req.file.size
            });

            res.status(200).json({
                success: true,
                message: 'Media uploaded successfully',
                data: {
                    fileId: file.id,
                    path: relativePath,
                    url: `/uploads${relativePath}`,
                    type: fileType,
                    originalName: req.file.originalname,
                    size: req.file.size
                }
            });
        } catch (error) {
            console.error('Upload chat media error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to upload media',
                error: error.message
            });
        }
    }

    /**
     * Upload group image
     * POST /api/upload/group-image
     * Can be used with or without groupId - if groupId is provided, group image is updated
     */
    static async uploadGroupImage(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            const groupId = req.body.groupId || req.params.groupId || req.params.id;

            const filePath = req.file.path.replace(/\\/g, '/');
            const relativePath = filePath.replace(UPLOAD_PATH.replace('./', ''), '');

            // If groupId is provided, update the group image
            if (groupId) {
                const GroupModel = require('../models/groupModel');
                await GroupModel.update(parseInt(groupId), {
                    image: relativePath
                });

                // Save file record
                await FileModel.create({
                    userId: req.user.id,
                    groupId: parseInt(groupId),
                    fileType: 'group_cover',
                    filePath: relativePath,
                    originalName: req.file.originalname,
                    fileSize: req.file.size
                });
            } else {
                // Just save file record without group association (for pre-creation uploads)
                await FileModel.create({
                    userId: req.user.id,
                    fileType: 'group_cover',
                    filePath: relativePath,
                    originalName: req.file.originalname,
                    fileSize: req.file.size
                });
            }

            res.status(200).json({
                success: true,
                message: 'Group image uploaded successfully',
                data: {
                    path: relativePath,
                    url: `/uploads${relativePath}`
                }
            });
        } catch (error) {
            console.error('Upload group image error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to upload group image',
                error: error.message
            });
        }
    }
}

module.exports = UploadController;
