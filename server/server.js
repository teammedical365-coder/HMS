// server/server.js
require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/db/db'); // <--- Import the DB connection logic

const PORT = process.env.PORT || 3000;

// 1. Connect to Database
connectDB();

// 2. Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});