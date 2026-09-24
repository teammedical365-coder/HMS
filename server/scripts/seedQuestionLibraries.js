const mongoose = require('mongoose');
const QuestionLibrary = require('../src/models/questionLibrary.model');
const Hospital = require('../src/models/hospital.model');
require('dotenv').config({ path: './.env' });

// Load MASTER_DEFAULT_QUESTION_LIBRARY from assistant.routes.js
const fs = require('fs');
const path = require('path');

async function seedQuestionLibraries() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB Atlas');

    // Read assistant.routes.js to extract MASTER_DEFAULT_QUESTION_LIBRARY
    const assistantRoutesCode = fs.readFileSync(path.join(__dirname, '../src/routes/assistant.routes.js'), 'utf8');
    const startIdx = assistantRoutesCode.indexOf('const MASTER_DEFAULT_QUESTION_LIBRARY = {');
    const endIdx = assistantRoutesCode.indexOf('// ───', startIdx + 50);
    const codeSegment = assistantRoutesCode.slice(startIdx, endIdx);
    
    // Evaluate MASTER_DEFAULT_QUESTION_LIBRARY safely
    const func = new Function(`${codeSegment}; return MASTER_DEFAULT_QUESTION_LIBRARY;`);
    const masterLib = func();

    console.log(`Master Library has ${Object.keys(masterLib).length} specialties:`, Object.keys(masterLib));

    // 1. Update or create global library
    await QuestionLibrary.findOneAndUpdate(
        { hospitalId: null },
        { $set: { data: masterLib, version: 10, updatedAt: new Date() } },
        { upsert: true, new: true }
    );
    console.log('Global QuestionLibrary updated to latest master library');

    // 2. Update all hospital-specific QuestionLibraries
    const hospitals = await Hospital.find({}).lean();
    for (const hosp of hospitals) {
        // Merge hospital custom questions if any, but ensure all 18 master specialties exist with structured options
        const existing = await QuestionLibrary.findOne({ hospitalId: hosp._id }).sort({ version: -1 });
        let updatedData = { ...masterLib };
        
        if (existing && existing.data) {
            // If existing had custom non-empty categories not in master, preserve them
            for (const [dept, cats] of Object.entries(existing.data)) {
                if (!updatedData[dept]) {
                    updatedData[dept] = cats;
                }
            }
        }

        const newVersion = (existing?.version || 0) + 1;
        await QuestionLibrary.findOneAndUpdate(
            { hospitalId: hosp._id },
            { $set: { data: updatedData, version: newVersion, updatedAt: new Date() } },
            { upsert: true, new: true }
        );
        console.log(`Hospital ${hosp.name} (${hosp._id}) QuestionLibrary updated to v${newVersion} with ${Object.keys(updatedData).length} specialties`);
    }

    console.log('All Question Libraries successfully seeded and synced with master library!');
    await mongoose.disconnect();
}

seedQuestionLibraries().catch(console.error);
