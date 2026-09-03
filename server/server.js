// 0. Install Windows File Lock & Read Error Guard (fixes errno -4094 UNKNOWN read errors)
require('./src/utils/fsGuard');

// Global Exception & Rejection Handlers to prevent server crash
process.on('uncaughtException', (err) => {
    console.error('💥 [Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 [Unhandled Rejection]:', reason);
});

// server/server.js
require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/db/db');

const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'cloud';

// 1. Connect to Database
connectDB();

// 4. HTTP Server and Socket.io Setup
const server = http.createServer(app);


// Socket.io CORS logic
const isAllowedOriginSocket = (origin) => {
    if (!origin) return true; 
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return true; 
    if (origin === 'https://medical365.in' || origin.endsWith('.medical365.in')) return true;
    if (origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) return true;
    if (origin.match(/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/)) return true;
    if (origin.startsWith('capacitor://') || origin.startsWith('http://capacitor')) return true;
    return true; // Allow client requests
};

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (isAllowedOriginSocket(origin)) return callback(null, true);
            callback(new Error('CORS blocked: ' + origin), false);
        },
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 30000,
    pingInterval: 25000
});

app.set('io', io);

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    // Clients can join a room based on their user ID or role to receive targeted events
    socket.on('join', (room) => {
        socket.join(room);
        console.log(`Socket ${socket.id} joined room ${room}`);
    });

    // Hospital-scoped room for real-time AI Wallet updates
    // All doctors from the same hospital join `hospital_${hospitalId}`
    socket.on('joinHospitalRoom', (hospitalId) => {
        if (hospitalId) {
            const room = `hospital_${hospitalId}`;
            socket.join(room);
            console.log(`Socket ${socket.id} joined hospital room ${room}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id);
    });
});

// 3. Attach tunnel relay (cloud only — accepts WebSocket connections from local servers)
if (DEPLOYMENT_MODE !== 'local') {
    const tunnelServer = require('./src/utils/tunnelServer');
    tunnelServer.attach(server);
}

// 4. Start Server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} [mode: ${DEPLOYMENT_MODE}] and listening on all interfaces (0.0.0.0)`);

    // 5. Post-startup services (after DB is ready — give it 3s)
    setTimeout(() => {
        // Ensure all hospitals have an initialized AI Wallet
        try {
            const aiWalletService = require('./src/services/ai/aiWallet.service');
            aiWalletService.ensureAllHospitalsHaveWallets();
        } catch (walletInitErr) {
            console.warn('⚠️ [AI Wallet Init Warning]:', walletInitErr.message);
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
    }, 3000);
});
// Trigger Restart
