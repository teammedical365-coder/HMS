const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Role = require('../models/role.model');
const { LMS_ROLE_TEMPLATES } = require('../constants/lmsPermissions');

async function seedRoles() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        // Existing Core System Roles
        const coreRoles = [
            {
                name: 'Pharmacist',
                description: 'Manages pharmacy inventory and orders',
                permissions: ['pharmacy_view', 'pharmacy_manage'],
                dashboardPath: '/pharmacy/orders',
                navLinks: [
                    { label: 'Orders', path: '/pharmacy/orders' },
                    { label: 'Inventory', path: '/pharmacy/inventory' }
                ],
                isSystemRole: true,
                hospitalId: null
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
                isSystemRole: true,
                hospitalId: null
            },
            {
                name: 'Accountant',
                description: 'Hospital finance, financial records, refund management, and accounting',
                permissions: ['finance_view', 'billing_view', 'billing_manage'],
                dashboardPath: '/accountant/dashboard',
                navLinks: [
                    { label: 'Dashboard', path: '/accountant/dashboard' },
                    { label: 'Financial Records', path: '/accountant/financial-records' },
                    { label: 'Refunds', path: '/accountant/refunds' },
                    { label: 'History', path: '/accountant/history' }
                ],
                isSystemRole: true,
                hospitalId: null
            }
        ];

        // Combine Core Roles + Official 7 LMS Roles
        const allRolesToSeed = [...coreRoles, ...LMS_ROLE_TEMPLATES];

        for (const roleDef of allRolesToSeed) {
            // Find existing role scoped to global/system level (hospitalId: null)
            const existing = await Role.findOne({
                name: roleDef.name,
                hospitalId: null
            });

            if (!existing) {
                await Role.create({
                    ...roleDef,
                    hospitalId: null,
                    isSystemRole: true
                });
                console.log(`✅ Created system role: ${roleDef.name}`);
            } else {
                // Update permissions, navLinks, description, and dashboardPath idempotently
                existing.permissions = roleDef.permissions;
                existing.navLinks = roleDef.navLinks;
                existing.dashboardPath = roleDef.dashboardPath;
                existing.description = roleDef.description;
                existing.isSystemRole = true;
                await existing.save();
                console.log(`🔄 Updated system role: ${roleDef.name}`);
            }
        }

        console.log('System roles seeding completed successfully.');
        process.exit(0);

    } catch (error) {
        console.error('Error seeding roles:', error);
        process.exit(1);
    }
}

// Allow direct execution or module invocation
if (require.main === module) {
    seedRoles();
}

module.exports = seedRoles;
