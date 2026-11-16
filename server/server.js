// 0. Install Windows File Lock & Read Error Guard (fixes errno -4094 UNKNOWN read errors)
require('./src/utils/fsGuard');

// Global Exception & Rejection Handlers to prevent server crash
process.on('uncaughtException', (err) => {
    // If it's EADDRINUSE, allow server.on('error') / portManager to handle it rather than crashing
    if (err && err.code === 'EADDRINUSE') {
        console.warn('⚠️ [EADDRINUSE Intercepted]: Handled by Port Manager.');
        return;
    }
    console.error('💥 [Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 [Unhandled Rejection]:', reason);
});

// server/server.js
require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/db/db');
const { ensurePortAvailableSync, killProcessOnPort } = require('./src/utils/portManager');

const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./src/config/jwt');

const PORT = process.env.PORT || 3000;
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'cloud';

// 1. Connect to Database
const dbPromise = connectDB();

// 4. HTTP Server and Socket.io Setup
const server = http.createServer(app);

// Keep-alive timeouts optimized for Render reverse proxy (must exceed 60s)
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Socket.io CORS logic with strict origin verification
const isAllowedOriginSocket = (origin) => {
    if (!origin) return true; 
    const clean = String(origin).trim().toLowerCase().replace(/\/+$/, '');
    if (clean.includes('localhost') || clean.includes('127.0.0.1')) return true; 
    if (clean === 'https://medical365.in' || clean.endsWith('.medical365.in') || clean.includes('medical365.in')) return true;
    if (clean.endsWith('.vercel.app') || clean.endsWith('.onrender.com') || clean.endsWith('.netlify.app')) return true;
    if (clean.match(/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/)) return true;
    if (clean.startsWith('capacitor://') || clean.startsWith('http://capacitor') || clean.startsWith('ionic://')) return true;
    return process.env.NODE_ENV !== 'production'; // Only fallback to true in development
};

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (isAllowedOriginSocket(origin)) return callback(null, true);
            callback(new Error('CORS not allowed for Socket.IO origin'));
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 30000,
    pingInterval: 25000
});

app.set('io', io);

// Socket.IO JWT Authentication Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
        // Allow unauthenticated connection for guest / public announcements if needed
        return next();
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
        next();
    } catch (err) {
        console.warn(`[Socket.io Auth Warning]: Rejected invalid token from ${socket.id}:`, err.message);
        next(new Error('Authentication failed: Invalid token'));
    }
});

io.on('connection', (socket) => {
    // Automatically join server-derived authenticated rooms (prevents cross-tenant leaks)
    if (socket.user) {
        const uId = socket.user.userId || socket.user.id;
        if (uId) {
            socket.join(`user_${uId}`);
        }
        if (socket.user.hospitalId) {
            socket.join(`hospital_${socket.user.hospitalId}`);
        }
    }

    // Secure room joining: verify ownership or administrative permissions
    socket.on('join', (room) => {
        if (!room || typeof room !== 'string') return;
        const uId = socket.user?.userId || socket.user?.id;
        const isOwnRoom = uId && (room === `user_${uId}` || room === String(uId));
        const isAdmin = socket.user?.role === 'superadmin' || socket.user?.role === 'centraladmin';
        if (isOwnRoom || isAdmin) {
            socket.join(room);
        } else {
            console.warn(`[Socket.io Security]: Unauthorized join attempt for room '${room}' by ${socket.id}`);
        }
    });

    // Secure hospital room joining: strictly verify hospitalId matches user's authorized hospital
    const handleJoinHospital = (hospitalId) => {
        if (!hospitalId) return;
        const isAuthorized = socket.user && (
            String(socket.user.hospitalId) === String(hospitalId) ||
            socket.user.role === 'superadmin' ||
            socket.user.role === 'centraladmin'
        );
        if (isAuthorized) {
            const room = `hospital_${hospitalId}`;
            socket.join(room);
        } else {
            console.warn(`[Socket.io Security]: Blocked unauthorized hospital room join '${hospitalId}' by ${socket.id}`);
        }
    };
    socket.on('joinHospitalRoom', handleJoinHospital);
    socket.on('join_hospital', handleJoinHospital);

    socket.on('disconnect', () => {
        // Clean disconnect
    });
});

// 3. Attach tunnel relay (cloud only — accepts WebSocket connections from local servers)
if (DEPLOYMENT_MODE !== 'local') {
    const tunnelServer = require('./src/utils/tunnelServer');
    tunnelServer.attach(server);
}

// 4. Server error handling & automatic port conflict resolution (EADDRINUSE)
server.on('error', async (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ [Port Conflict] Port ${PORT} is occupied by another process.`);
        console.log(`🧹 [Port Conflict] Automatically reclaiming port ${PORT}...`);
        const freed = await killProcessOnPort(PORT);
        if (freed) {
            console.log(`✅ [Port Conflict] Successfully reclaimed port ${PORT}. Resuming server on port ${PORT}...`);
            setTimeout(() => {
                server.listen(PORT, '0.0.0.0');
            }, 600);
            return;
        } else {
            console.error(`❌ [Port Conflict] Could not free port ${PORT}. Please check permissions.`);
            process.exit(1);
        }
    } else {
        console.error('💥 [Server Error]:', err);
        process.exit(1);
    }
});

// Proactively free port from any stale/zombie process before listening
ensurePortAvailableSync(PORT);

// 5. Start Server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} [mode: ${DEPLOYMENT_MODE}] and listening on all interfaces (0.0.0.0)`);

    // 5. Post-startup services (guaranteed execution after DB is fully connected)
    (async () => {
        try {
            await dbPromise;
        } catch (dbErr) {
            console.error('❌ [Startup Error] Post-startup initialization skipped: DB connection failed:', dbErr.message);
            return;
        }

        // Ensure all hospitals have an initialized AI Wallet
        try {
            const aiWalletService = require('./src/services/ai/aiWallet.service');
            await aiWalletService.ensureAllHospitalsHaveWallets();
        } catch (walletInitErr) {
            console.warn('⚠️ [AI Wallet Init Warning]:', walletInitErr.message);
        }

        // 6. Start ABDM inbox recovery worker (async callback processor)
        try {
            require('./src/modules/abdm/abdm.inbox.processor').startInboxWorker();
            console.log('✅ [ABDM] Inbox recovery worker started');
        } catch (inboxErr) {
            console.warn('⚠️ [ABDM Inbox Worker Warning]:', inboxErr.message);
        }

        if (DEPLOYMENT_MODE === 'local') {
            // Start sync service — pushes stats to cloud every 15 min
            const syncService = require('./src/utils/syncService');
            syncService.start();

            // Start tunnel client — maintains WebSocket to cloud for patient app
            const tunnelClient = require('./src/utils/tunnelClient');
            tunnelClient.setApp(app);
            tunnelClient.connect();
        }
    })();
});

// 5. Graceful Process Termination (Handles SIGTERM/SIGINT from Render & Docker)
const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 [${signal}] Graceful shutdown requested. Draining connections...`);
    server.close(async () => {
        console.log('✅ [HTTP Server] All incoming connections closed.');
        try {
            const { closeAllTenantConnections } = require('./src/db/tenantDb');
            await closeAllTenantConnections();
            console.log('✅ [Tenant DBs] All tenant connection pools closed.');
        } catch (tErr) {
            console.warn('⚠️ [Tenant DB Close Warning]:', tErr.message);
        }

        try {
            const mongoose = require('mongoose');
            if (mongoose.connection.readyState === 1) {
                await mongoose.connection.close(false);
                console.log('✅ [MongoDB Master] Connection closed cleanly.');
            }
        } catch (dbErr) {
            console.error('⚠️ [MongoDB Close Error]:', dbErr.message);
        }
        process.exit(0);
    });

    // Force termination if connections don't drain within 10 seconds
    setTimeout(() => {
        console.error('⚠️ [Shutdown Timeout] Forcing process termination.');
        process.exit(1);
    }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Trigger Restart
