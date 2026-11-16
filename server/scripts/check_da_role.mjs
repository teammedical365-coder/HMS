import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGODB_URL);
    const roleId = new mongoose.Types.ObjectId('6ab74f403917880e06c3bcfb');
    const role = await mongoose.connection.collection('roles').findOne({ _id: roleId });
    console.log('Role 6ab74f403917880e06c3bcfb:', role);
    await mongoose.disconnect();
}

run().catch(console.error);

