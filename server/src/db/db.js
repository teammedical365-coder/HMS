const mongoose = require('mongoose');

async function connectDB() {
    try {
        const mongoUrl = process.env.MONGODB_URL;
        
        if (!mongoUrl) {
            console.error('❌ MONGODB_URL is not defined in environment variables');
            process.exit(1);
        }

        // Validate connection string format
        if (mongoUrl.includes('mongodb+srv://') || mongoUrl.includes('mongodb://')) {
            console.log('🔗 Attempting to connect to MongoDB...');
        } else {
            console.error('❌ Invalid MongoDB connection string format');
            console.error('   Expected format: mongodb+srv://username:password@cluster.mongodb.net/databaseName');
            process.exit(1);
        }

        // MongoDB Atlas connection options
        const options = {
            serverSelectionTimeoutMS: 30000, // Increased timeout for Atlas
            socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
            connectTimeoutMS: 30000, // Give up initial connection after 30 seconds
            retryWrites: true,
            w: 'majority',
            maxPoolSize: 10, // Maintain up to 10 socket connections
            minPoolSize: 2, // Maintain at least 2 socket connections
        };

        await mongoose.connect(mongoUrl, options);
        console.log('✅ Connected to MongoDB successfully');

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err.message);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB disconnected');
        });

        // Drop old username index if it exists (migration fix)
        // This fixes the E11000 duplicate key error for username field
        try {
            const User = mongoose.connection.collection('users');
            const indexes = await User.indexes();
            const usernameIndex = indexes.find(idx => idx.name === 'username_1');

            if (usernameIndex) {
                await User.dropIndex('username_1');
                console.log('✓ Dropped old username_1 index (migration fix)');
            }
        } catch (indexError) {
            // Index might not exist or collection might not exist, ignore error
            // Code 26 is "NamespaceNotFound", Code 27 is "IndexNotFound"
            if (indexError.code !== 27 && indexError.code !== 26 && indexError.codeName !== 'IndexNotFound' && indexError.codeName !== 'NamespaceNotFound') {
                console.log('Note: Could not check/drop username index:', indexError.message);
            }
        }
    } catch (err) {
        console.error('❌ Database connection error:', err.message);
        
        // Provide helpful error messages
        if (err.message.includes('IP') || err.message.includes('whitelist') || err.message.includes('ReplicaSetNoPrimary')) {
            console.error('\n💡 IP Whitelist / Network Access Issue:');
            console.error('   1. Go to MongoDB Atlas → Network Access (or Security → Network Access)');
            console.error('   2. Click "Add IP Address"');
            console.error('   3. Add 0.0.0.0/0 (allow from anywhere) OR your current IP address');
            console.error('   4. IMPORTANT: Wait 2-5 minutes for changes to propagate');
            console.error('   5. If you added 0.0.0.0/0, make sure it shows as "Active" in the list');
            console.error('   6. Try restarting your server after waiting\n');
        } else if (err.message.includes('authentication') || err.message.includes('bad auth')) {
            console.error('\n💡 Authentication Issue:');
            console.error('   1. Check your MongoDB Atlas username and password');
            console.error('   2. If your password contains special characters, URL encode them:');
            console.error('      - @ becomes %40');
            console.error('      - : becomes %3A');
            console.error('      - / becomes %2F');
            console.error('      - # becomes %23');
            console.error('      - Space becomes %20');
            console.error('   3. Ensure your database user has proper permissions');
            console.error('   4. Verify your connection string format:');
            console.error('      mongodb+srv://username:password@cluster.mongodb.net/databaseName\n');
        } else if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
            console.error('\n💡 Network/DNS Issue:');
            console.error('   1. Check your internet connection');
            console.error('   2. Verify the MongoDB Atlas cluster is running');
            console.error('   3. Check if your connection string is correct\n');
        }
        
        // Don't exit the process, let the server start but log the error
        // The server can retry connection on next request
    }
}

module.exports = connectDB;