const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const { testConnection, initializeDatabase } = require('./config/db');
const { initializeSocket } = require('./services/socketHandler');
const { initializeEmail } = require('./config/email');
const OtpModel = require('./models/otpModel');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const contactRoutes = require('./routes/contactRoutes');
const chatRoutes = require('./routes/chatRoutes');
const groupRoutes = require('./routes/groupRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Socket.IO setup
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});

// Make io accessible in routes
app.set('io', io);

// Initialize socket handler
initializeSocket(io);

// Middleware - CORS with full support for file uploads
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    credentials: false,
    maxAge: 86400
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'ClinxChat API is running',
        timestamp: new Date().toISOString()
    });
});

// Root endpoint with API documentation
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'ClinxChat API',
        version: '1.0.0',
        endpoints: {
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                logout: 'POST /api/auth/logout',
                me: 'GET /api/auth/me',
                changePassword: 'POST /api/auth/change-password'
            },
            users: {
                getAll: 'GET /api/users',
                search: 'GET /api/users/search?q=',
                getById: 'GET /api/users/:id',
                update: 'PUT /api/users/:id',
                updateStatus: 'PUT /api/users/:id/status',
                delete: 'DELETE /api/users/:id'
            },
            contacts: {
                getAll: 'GET /api/contacts',
                search: 'GET /api/contacts/search?q=',
                add: 'POST /api/contacts',
                remove: 'DELETE /api/contacts/:userId'
            },
            chats: {
                getAll: 'GET /api/chats',
                getPrivate: 'GET /api/chats/private/:userId',
                sendPrivate: 'POST /api/chats/private/send',
                getMessages: 'GET /api/chats/:chatId/messages',
                getMedia: 'GET /api/chats/:chatId/media',
                markSeen: 'PUT /api/chats/:chatId/seen'
            },
            groups: {
                getAll: 'GET /api/groups',
                create: 'POST /api/groups',
                getById: 'GET /api/groups/:id',
                update: 'PUT /api/groups/:id',
                delete: 'DELETE /api/groups/:id',
                addMember: 'POST /api/groups/:id/members',
                updateMemberRole: 'PUT /api/groups/:id/members/:userId',
                removeMember: 'DELETE /api/groups/:id/members/:userId',
                getPermissions: 'GET /api/groups/:id/permissions',
                updatePermissions: 'PUT /api/groups/:id/permissions',
                sendMessage: 'POST /api/groups/:id/messages',
                getMedia: 'GET /api/groups/:groupId/media'
            },
            upload: {
                userProfile: 'POST /api/upload/user-profile',
                chatMedia: 'POST /api/upload/chat-media',
                groupImage: 'POST /api/upload/group-image'
            },
            notifications: {
                getAll: 'GET /api/notifications',
                markAsRead: 'PUT /api/notifications/:id/read',
                markAllAsRead: 'PUT /api/notifications/read-all',
                delete: 'DELETE /api/notifications/:id'
            },
            websocket: {
                events: [
                    'send_message',
                    'receive_message',
                    'typing',
                    'stop_typing',
                    'message_seen',
                    'user_online',
                    'user_offline',
                    'join_group',
                    'leave_group',
                    'notification'
                ]
            },
            health: 'GET /health'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);

    // Handle multer errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'File size too large'
        });
    }

    res.status(500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

// Start server
const startServer = async () => {
    try {
        // Initialize database and create tables
        await initializeDatabase();

        // Initialize OTP table
        await OtpModel.initialize();

        // Initialize email transporter
        initializeEmail();

        // Test database connection
        await testConnection();

        server.listen(PORT, () => {
            console.log(`\n🚀 ClinxChat API is running on http://localhost:${PORT}`);
            console.log(`📋 API Documentation: http://localhost:${PORT}/`);
            console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
            console.log(`🔌 WebSocket Server: ws://localhost:${PORT}\n`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
