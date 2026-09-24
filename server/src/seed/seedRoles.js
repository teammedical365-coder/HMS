require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../models/role.model');

async function seedRoles() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        const roles = [
            {
                name: 'Lab Technician',
                description: 'Manages lab tests and reports',
                permissions: ['lab_view', 'lab_manage'],
                dashboardPath: '/lab/dashboard',
                navLinks: [
                    { label: 'Dashboard', path: '/lab/dashboard' },
                    { label: 'Assigned Tests', path: '/lab/tests' }
                ],
                isSystemRole: true
            },
            {
                name: 'Pharmacist',
                description: 'Manages pharmacy inventory and orders',
                permissions: ['pharmacy_view', 'pharmacy_manage'],
                dashboardPath: '/pharmacy/orders',
                navLinks: [
                    { label: 'Orders', path: '/pharmacy/orders' },
                    { label: 'Inventory', path: '/pharmacy/inventory' }
                ],
                isSystemRole: true
            },
            {
                name: 'Doctor Assistant',
                description: 'Pre-consultation patient preparation, vitals, and department questionnaires',
                permissions: ['assistant_access', 'assistant_prepare', 'question_library_view', 'vitals_record'],
                dashboardPath: '/assistant/dashboard',
                navLinks: [
                    { label: 'Dashboard', path: '/assistant/dashboard' },
                    { label: 'Patient Queue', path: '/assistant/queue' },
                    { label: 'Question Library', path: '/assistant/question-library' }
                ],
                isSystemRole: true
            }
        ];

        for (const roleDef of roles) {
            const existing = await Role.findOne({ name: roleDef.name });
            if (!existing) {
                await Role.create(roleDef);
                console.log(`✅ Created role: ${roleDef.name}`);
            } else {
                // Update permissions and navLinks if they changed
                existing.permissions = roleDef.permissions;
                existing.navLinks = roleDef.navLinks;
                existing.dashboardPath = roleDef.dashboardPath;
                await existing.save();
                console.log(`🔄 Updated role: ${roleDef.name}`);
            }
        }

        console.log('Seeding completed.');
        process.exit(0);

    } catch (error) {
        console.error('Error seeding roles:', error);
        process.exit(1);
    }
}

seedRoles();
