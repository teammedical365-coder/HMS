import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    console.log('Connecting to Mongo URL:', process.env.MONGODB_URL ? 'Loaded' : 'Missing');
    const conn = mongoose.createConnection(process.env.MONGODB_URL, {
        dbName: 'hms_hospital_6aaa0637ca3e7fc08c0d1f57',
        serverSelectionTimeoutMS: 5000
    });

    conn.on('connected', () => console.log('Connected!'));
    conn.on('error', (err) => console.error('Connection Error:', err));

    await new Promise((resolve, reject) => {
        conn.once('open', () => {
            console.log('Open event fired!');
            resolve();
        });
        conn.once('error', reject);
    });

    const admissions = await conn.collection('admissions').find({}).toArray();
    console.log('Found admissions:', admissions.length);

    await conn.close();
}
run().catch(console.error);

