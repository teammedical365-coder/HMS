const mongoose = require('mongoose');
const MONGODB_URL = 'mongodb+srv://crm:ilK0TxSZI3UJLijE@cluster0.bzkyl0e.mongodb.net/';

async function checkJabba() {
    await mongoose.connect(MONGODB_URL);
    const db = mongoose.connection.db;

    const jabbaUser = await db.collection('users').findOne({ name: { $regex: /jabba/i } });
    if (jabbaUser) {
        console.log("USER DOC:", jabbaUser.name, "Dept:", jabbaUser.departments, "Hospital:", jabbaUser.hospitalId);
        const jabbaDoc = await db.collection('doctors').findOne({ userId: jabbaUser._id });
        if (jabbaDoc) {
             console.log("DOCTOR DOC:", "Dept:", jabbaDoc.departments, "Hospital:", jabbaDoc.hospitalId);
        } else {
             console.log("NO DOCTOR PROFILE FOR THIS USER!");
        }
    } else {
        console.log("Dr. Jabba user not found in DB.");
    }
    process.exit(0);
}

checkJabba();
