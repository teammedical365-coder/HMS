/**
 * Seed Central Admin User
 * 
 * Creates a Central Admin / Super Admin user in the database
 * using the existing User model and bcrypt password hashing.
 * 
 * Usage:
 *   node scripts/seed-admin.js
 * 
 * Environment variables (set in .env or pass inline):
 *   ADMIN_EMAIL    — admin email address
 *   ADMIN_PASSWORD — admin password (will be bcrypt hashed by the User model)
 *   ADMIN_NAME     — admin display name
 *   ADMIN_PHONE    — 10-digit phone number
 * 
 * If environment variables are not set, the script will prompt interactively.
 * 
 * ⚠️  This script does NOT print or log the password.
 * ⚠️  This script does NOT modify existing users.
 * ⚠️  This script uses the existing User model's pre-save bcrypt hook for hashing.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const readline = require('readline');

// Use the EXISTING project models — no new auth logic
const User = require('../src/models/user.model');

const DB_URI = process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/crm';

// ── Interactive prompt helper ─────────────────────────────────────────────────
function ask(question, hidden = false) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        if (hidden) {
            // Hide password input
            process.stdout.write(question);
            const stdin = process.openStdin();
            let password = '';
            const onData = (char) => {
                char = char.toString();
                if (char === '\n' || char === '\r' || char === '\u0004') {
                    stdin.removeListener('data', onData);
                    process.stdout.write('\n');
                    rl.close();
                    resolve(password);
                } else if (char === '\u007F' || char === '\b') {
                    // Backspace
                    if (password.length > 0) {
                        password = password.slice(0, -1);
                        process.stdout.clearLine(0);
                        process.stdout.cursorTo(0);
                        process.stdout.write(question + '*'.repeat(password.length));
                    }
                } else {
                    password += char;
                    process.stdout.write('*');
                }
            };
            stdin.on('data', onData);
        } else {
            rl.question(question, (answer) => {
                rl.close();
                resolve(answer.trim());
            });
        }
    });
}

async function seedAdmin() {
    try {
        // ── Gather input (env vars or interactive) ────────────────────────────
        const email = process.env.ADMIN_EMAIL || await ask('Email: ');
        const password = process.env.ADMIN_PASSWORD || await ask('Password: ', true);
        const name = process.env.ADMIN_NAME || await ask('Full Name: ');
        const phone = process.env.ADMIN_PHONE || await ask('Phone (10 digits): ');

        // ── Validate ──────────────────────────────────────────────────────────
        if (!email || !password || !name || !phone) {
            console.error('❌ All fields are required: email, password, name, phone');
            process.exit(1);
        }

        if (!/^\S+@\S+\.\S+$/.test(email)) {
            console.error('❌ Invalid email format');
            process.exit(1);
        }

        if (!/^\d{10}$/.test(phone)) {
            console.error('❌ Phone must be exactly 10 digits');
            process.exit(1);
        }

        // ── Connect ───────────────────────────────────────────────────────────
        await mongoose.connect(DB_URI);
        console.log('✅ Connected to MongoDB');

        // ── Check for existing user ───────────────────────────────────────────
        const normalizedEmail = email.toLowerCase().trim();
        const existing = await User.findOne({ email: normalizedEmail });

        if (existing) {
            console.log(`⚠️  User with email "${normalizedEmail}" already exists.`);
            console.log(`   Role: ${existing.role}`);
            console.log(`   Name: ${existing.name}`);
            console.log('   No changes made. Exiting.');
            await mongoose.disconnect();
            process.exit(0);
        }

        // ── Create user using the EXISTING User model ─────────────────────────
        // The User model's pre-save hook automatically bcrypt-hashes the password.
        // Role is set to 'centraladmin' (string) — this is how the login system
        // identifies Central Admin users (see emailOtp.routes.js line 228-234).
        const user = new User({
            name,
            email: normalizedEmail,
            password,              // Will be bcrypt hashed by User model pre-save hook
            phone,
            role: 'centraladmin',  // String role — recognized by the login system
            hospitalId: null,      // Central admin has no hospital scope
        });

        await user.save();

        console.log('\n🎉 Central Admin user created successfully!');
        console.log(`   Name:  ${user.name}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Role:  ${user.role}`);
        console.log(`   ID:    ${user._id}`);
        console.log('\n📌 Login at: /centraladmin/login');
        console.log('   (Password is securely hashed — not logged)');

        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await mongoose.disconnect();
        process.exit(1);
    }
}

seedAdmin();
