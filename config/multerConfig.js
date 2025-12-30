const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads';

// Ensure directory exists
const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

// User profile picture storage
const userProfileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userId = req.user.id;
        const userDir = path.join(UPLOAD_PATH, 'users', `user_${userId}`);
        ensureDir(userDir);
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `profile${ext}`);
    }
});

// Chat media storage
const chatMediaStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const chatId = req.body.chatId || req.params.chatId;
        let subFolder = 'images';

        if (file.mimetype.startsWith('image/')) {
            subFolder = 'images';
        } else if (file.mimetype === 'application/pdf') {
            subFolder = 'pdf';
        } else if (file.mimetype.startsWith('audio/')) {
            subFolder = 'voice';
        } else if (file.mimetype.startsWith('video/')) {
            subFolder = 'video';
        }

        const chatDir = path.join(UPLOAD_PATH, 'chats', `chat_${chatId}`, subFolder);
        ensureDir(chatDir);
        cb(null, chatDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `${uuidv4()}${ext}`;
        cb(null, uniqueName);
    }
});

// Group image storage
const groupImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const groupId = req.body.groupId || req.params.groupId || req.params.id;
        const groupDir = path.join(UPLOAD_PATH, 'groups', `group_${groupId}`);
        ensureDir(groupDir);
        cb(null, groupDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `cover${ext}`);
    }
});

// File filter for images
const imageFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

// File filter for chat media
const chatMediaFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg',
        'application/pdf',
        'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm',
        'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/3gpp',
        'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp',
        'application/octet-stream' // Fallback for unknown types
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        console.log('Rejected file type:', file.mimetype);
        cb(new Error(`File type ${file.mimetype} not allowed!`), false);
    }
};

// Max file size (50MB)
const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 52428800;

// Export configured uploaders
const uploadUserProfile = multer({
    storage: userProfileStorage,
    fileFilter: imageFilter,
    limits: { fileSize: maxSize }
});

const uploadChatMedia = multer({
    storage: chatMediaStorage,
    fileFilter: chatMediaFilter,
    limits: { fileSize: maxSize }
});

const uploadGroupImage = multer({
    storage: groupImageStorage,
    fileFilter: imageFilter,
    limits: { fileSize: maxSize }
});

module.exports = {
    uploadUserProfile,
    uploadChatMedia,
    uploadGroupImage,
    UPLOAD_PATH
};
