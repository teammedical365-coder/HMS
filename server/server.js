// server/server.js
require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/db/db'); // <--- Import the DB connection logic

const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

// 1. Connect to Database
connectDB();

// 2. HTTP Server and Socket.io
const server = http.createServer(app);
const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (origin.includes('localhost')) return true;
    if (origin === 'https://medical365.in') return true;
    if (origin === 'https://www.medical365.in') return true;
    if (origin.endsWith('.medical365.in')) return true;
    return false;
};

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (isAllowedOrigin(origin)) return callback(null, true);
            callback(new Error('CORS blocked: ' + origin), false);
        },
        methods: ["GET", "POST"]
    }
});

app.set('io', io);

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    // Clients can join a room based on their user ID or role to receive targeted events
    socket.on('join', (room) => {
        socket.join(room);
        console.log(`Socket ${socket.id} joined room ${room}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id);
    });
});

// 3. Start Server
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
// Trigger Restart
