/**
 * Seed Default Roles into MongoDB
 * 
 * Run: node seed-roles.js
 * 
 * This creates the default roles so the system works out of the box.
 * Admins can still create additional custom roles via the UI.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('./src/models/role.model');

const DB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/crm';

const defaultRoles = [
    {
        name: 'Admin',
        description: 'Hospital superadmin with full management access',
        permissions: [
            'admin_manage_roles', 'admin_view_stats',
            'patient_search', 'patient_create', 'patient_view', 'patient_edit',
            'appointment_view_all', 'appointment_manage',
            'lab_view', 'lab_manage',
            'pharmacy_view', 'pharmacy_manage',
            'visit_intake', 'visit_diagnose', 'clinical_history_view'
        ],
        dashboardPath: '/admin',
        navLinks: [
            { label: 'Dashboard', path: '/admin' },
            { label: 'Users', path: '/admin/users' },
            { label: 'Doctors', path: '/admin/doctors' },
            { label: 'Labs', path: '/admin/labs' },
            { label: 'Pharmacy', path: '/admin/pharmacy' },
            { label: 'Reception', path: '/admin/reception' },
            { label: 'Services', path: '/admin/services' },
            { label: 'Roles', path: '/admin/roles' }
        ],
        isSystemRole: true
    },
    {
        name: 'Doctor',
        description: 'Medical doctor with clinical access',
        permissions: [
            'visit_diagnose', 'patient_view', 'clinical_history_view',
            'lab_view', 'pharmacy_view'
        ],
        dashboardPath: '/doctor/patients',
        navLinks: [
            { label: 'Patients', path: '/doctor/patients' }
        ],
        isSystemRole: true
    },
    {
        name: 'Lab Technician',
        description: 'Laboratory staff managing tests and reports',
        permissions: [
            'lab_view', 'lab_manage', 'patient_view'
        ],
        dashboardPath: '/lab/dashboard',
        navLinks: [
            { label: 'Dashboard', path: '/lab/dashboard' },
            { label: 'Assigned Tests', path: '/lab/tests' }
        ],
        isSystemRole: true
    },
    {
        name: 'Pharmacist',
        description: 'Pharmacy staff managing inventory and orders',
        permissions: [
            'pharmacy_view', 'pharmacy_manage', 'patient_view'
        ],
        dashboardPath: '/pharmacy/inventory',
        navLinks: [
            { label: 'Inventory', path: '/pharmacy/inventory' },
            { label: 'Orders', path: '/pharmacy/orders' }
        ],
        isSystemRole: true
    },
    {
        name: 'Receptionist',
        description: 'Front desk staff managing appointments and patient registration',
        permissions: [
            'appointment_manage', 'appointment_view_all',
            'patient_search', 'patient_create', 'patient_view',
            'visit_intake'
        ],
        dashboardPath: '/reception/dashboard',
        navLinks: [
            { label: 'Dashboard', path: '/reception/dashboard' }
        ],
        isSystemRole: true
    },
    {
        name: 'Patient',
        description: 'Default role for patients/users',
        permissions: [
            'patient_view'
        ],
        dashboardPath: '/dashboard',
        navLinks: [
            { label: 'Services', path: '/services' },
            { label: 'Doctors', path: '/doctors' },
            { label: 'Appointment', path: '/appointment' },
            { label: 'Lab Reports', path: '/lab-reports' },
            { label: 'Dashboard', path: '/dashboard' }
        ],
        isSystemRole: true
    }
];

async function seedRoles() {
    try {
        await mongoose.connect(DB_URI);
        console.log('✅ Connected to MongoDB');

        for (const roleData of defaultRoles) {
            // Use compound key: name + hospitalId (null = global role)
            const existing = await Role.findOne({ name: roleData.name, hospitalId: null });
            if (existing) {
                Object.assign(existing, roleData);
                await existing.save();
                console.log(`🔄 Updated role: ${roleData.name}`);
            } else {
                await Role.create({ ...roleData, hospitalId: null });
                console.log(`✅ Created role: ${roleData.name}`);
            }
        }

        console.log('\n🎉 All default roles seeded successfully!');
        console.log('You can now assign these roles to users via the Central Admin dashboard.');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding roles:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

seedRoles();
