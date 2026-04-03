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
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            const allowedOrigins = ["http://localhost:5173", "http://localhost:3000", "https://crm-ebon-two.vercel.app", "https://crm-222i.onrender.com", "https://crm-arkw.vercel.app", "https://www.boonkies.com", "https://boonkies.com", "https://admin.boonkies.com", "https://medical365.in", "https://www.medical365.in", "https://admin.medical365.in"];
            if (!origin || origin.includes('localhost') || allowedOrigins.includes(origin) || origin.endsWith('.boonkies.com') || origin.endsWith('.medical365.in')) {
                callback(null, true);
            } else {
                callback(new Error('CORS blocked origin: ' + origin), false);
            }
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
