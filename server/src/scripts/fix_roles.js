const mongoose = require('mongoose');
const Role = require('../models/role.model');

const PERMISSION_NAV_MAP = {
    // Patient Management
    patient_create: { label: 'Patient Registration', path: '/reception/dashboard' },
    patient_search: { label: 'Patient Search', path: '/doctor/patients' },
    patient_view: { label: 'Patient Records', path: '/doctor/patients' },
    patient_edit: { label: 'Edit Patients', path: '/doctor/patients' },
    // Clinical & Medical
    visit_intake: { label: 'Nurse Intake', path: '/doctor/patients' },
    visit_diagnose: { label: 'Consultations', path: '/doctor/patients' },
    clinical_history_view: { label: 'Medical History', path: '/doctor/patients' },
    // Operations
    appointment_manage: { label: 'Reception', path: '/reception/dashboard' },
    appointment_view_all: { label: 'All Appointments', path: '/reception/dashboard' },
    lab_view: { label: 'Lab Dashboard', path: '/lab/dashboard' },
    lab_manage: { label: 'Lab Tests', path: '/lab/tests' },
    pharmacy_view: { label: 'Pharmacy', path: '/pharmacy/inventory' },
    pharmacy_manage: { label: 'Pharmacy Orders', path: '/pharmacy/orders' },
    // Admin
    admin_manage_roles: { label: 'Manage Users', path: '/admin/users' },
    admin_view_stats: { label: 'Admin Dashboard', path: '/admin' },
    finance_view: { label: 'Finance & Accounting', path: '/accountant/dashboard' },
    // Cashier
    billing_view: { label: 'Patient Billing', path: '/cashier/billing' },
    billing_manage: { label: 'Patient Billing', path: '/cashier/billing' }
};

const getAutoNavLinks = (permissions) => {
    const seen = new Set();
    const links = [];
    permissions.forEach(perm => {
        const mapping = PERMISSION_NAV_MAP[perm];
        if (mapping && !seen.has(mapping.label)) {
            seen.add(mapping.label);
            links.push({ label: mapping.label, path: mapping.path });
        }
    });
    if (permissions.includes('admin_manage_roles') && !seen.has('Manage Roles')) {
        links.push({ label: 'Manage Roles', path: '/admin/roles' });
    }
    return links;
};

const dbURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm_db';

mongoose.connect(dbURI)
    .then(async () => {
        console.log('Connected to DB');
        const roles = await Role.find({});
        for (const role of roles) {
            const autoLinks = getAutoNavLinks(role.permissions || []);
            const manualLinks = role.navLinks || [];
            
            const combinedLinks = [...manualLinks];
            autoLinks.forEach(auto => {
                if (!combinedLinks.find(c => c.path === auto.path || c.label === auto.label)) {
                    combinedLinks.push(auto);
                }
            });
            
            role.navLinks = combinedLinks;
            await role.save();
            console.log(`Updated role: ${role.name}`);
        }
        console.log('All roles updated');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error connecting to DB', err);
        process.exit(1);
    });
