/**
 * Medical365 Laboratory Management System (LMS)
 * Granular Permissions Catalog and System Role Templates
 * Reference: LMS Master Documentation (07_ROLE_PERMISSION_MATRIX.md)
 */

// 1. Granular Action-Level Permissions across all 10 clinical modules
const LMS_PERMISSIONS = {
    // Patients & Accessioning
    PATIENTS_VIEW: 'patients:view',
    PATIENTS_CREATE: 'patients:create',
    PATIENTS_UPDATE: 'patients:update',
    PATIENTS_DELETE: 'patients:delete',

    // Laboratory Orders & Requisitions
    ORDERS_VIEW: 'orders:view',
    ORDERS_CREATE: 'orders:create',
    ORDERS_UPDATE: 'orders:update',
    ORDERS_DELETE: 'orders:delete',
    ORDERS_CANCEL: 'orders:cancel',
    ORDERS_DISCOUNT: 'orders:discount',

    // Specimen & Sample Tracking
    SAMPLES_VIEW: 'samples:view',
    SAMPLES_COLLECT: 'samples:collect',
    SAMPLES_RECEIVE: 'samples:receive',
    SAMPLES_PROCESS: 'samples:process',
    SAMPLES_VERIFY: 'samples:verify',
    SAMPLES_REJECT: 'samples:reject',
    SAMPLES_RECOLLECT: 'samples:recollect',

    // Test Catalog & Tariffs
    TESTS_VIEW: 'tests:view',
    TESTS_MANAGE: 'tests:manage',
    TESTS_CREATE: 'tests:create',
    TESTS_UPDATE: 'tests:update',
    TESTS_PRICE_EDIT: 'tests:price_edit',

    // Result Findings Entry
    RESULTS_ENTER: 'results:enter',
    RESULTS_EDIT_PRELIMINARY: 'results:edit_preliminary',

    // Diagnostic Reports
    REPORTS_VIEW: 'reports:view',
    REPORTS_CREATE: 'reports:create',
    REPORTS_VERIFY: 'reports:verify',
    REPORTS_RELEASE: 'reports:release',
    REPORTS_REJECT: 'reports:reject',
    REPORTS_DOWNLOAD: 'reports:download',

    // Billing & Financial Settlement
    BILLING_VIEW: 'billing:view',
    BILLING_MANAGE: 'billing:manage',
    BILLING_INVOICE_CREATE: 'billing:invoice_create',
    BILLING_COLLECT_PAYMENT: 'billing:collect_payment',
    BILLING_DISCOUNT: 'billing:discount',
    BILLING_DISCOUNT_APPROVE: 'billing:discount:approve',
    BILLING_REFUND: 'billing:refund',
    BILLING_REFUND_APPROVE: 'billing:refund:approve',
    BILLING_ADVANCE_CREATE: 'billing:advance:create',
    BILLING_ADVANCE_ADJUST: 'billing:advance:adjust',
    BILLING_REPORTS_VIEW: 'billing:reports:view',
    BILLING_CASH_REGISTER_VIEW: 'billing:cash_register:view',
    BILLING_CASH_REGISTER_CLOSE: 'billing:cash_register:close',

    // Users & Staff Directory
    USERS_VIEW: 'users:view',
    USERS_MANAGE: 'users:manage',

    // Role & Permission Builder
    ROLES_VIEW: 'roles:view',
    ROLES_MANAGE: 'roles:manage',

    // Regulatory Audit Trail
    AUDIT_VIEW: 'audit:view',

    // Settings & Branding
    SETTINGS_VIEW: 'settings:view',
    SETTINGS_MANAGE: 'settings:manage',

    // Backward-Compatibility Aliases
    LEGACY_LAB_VIEW: 'lab_view',
    LEGACY_LAB_MANAGE: 'lab_manage'
};

// 2. The Seven Official LMS Operational Role Templates
const LMS_ROLE_TEMPLATES = [
    {
        name: 'Lab Admin',
        description: 'Laboratory Administrator with complete laboratory oversight, test catalog management, pricing, staff directory, settings, and full diagnostic operations.',
        dashboardPath: '/lab/dashboard',
        isSystemRole: true,
        hospitalId: null,
        navLinks: [
            { label: 'Dashboard', path: '/lab/dashboard' },
            { label: 'Orders', path: '/lab/orders' },
            { label: 'Samples', path: '/lab/samples' },
            { label: 'Test Catalog', path: '/lab/catalog' },
            { label: 'Reports', path: '/lab/reports' },
            { label: 'Billing', path: '/lab/billing' },
            { label: 'Staff Directory', path: '/lab/staff' },
            { label: 'Settings', path: '/lab/settings' }
        ],
        permissions: [
            'lab_view',
            'lab_manage',
            'patients:view',
            'patients:create',
            'patients:update',
            'patients:delete',
            'orders:view',
            'orders:create',
            'orders:update',
            'orders:delete',
            'orders:cancel',
            'orders:discount',
            'samples:view',
            'samples:collect',
            'samples:receive',
            'samples:process',
            'samples:verify',
            'samples:reject',
            'samples:recollect',
            'tests:view',
            'tests:manage',
            'tests:create',
            'tests:update',
            'tests:price_edit',
            'results:enter',
            'results:edit_preliminary',
            'reports:view',
            'reports:create',
            'reports:verify',
            'reports:release',
            'reports:reject',
            'reports:download',
            'billing:view',
            'billing:manage',
            'billing:invoice_create',
            'billing:collect_payment',
            'billing:discount',
            'billing:discount:approve',
            'billing:refund',
            'billing:refund:approve',
            'billing:advance:create',
            'billing:advance:adjust',
            'billing:reports:view',
            'billing:cash_register:view',
            'billing:cash_register:close',
            'users:view',
            'users:manage',
            'roles:view',
            'roles:manage',
            'audit:view',
            'settings:view',
            'settings:manage'
        ]
    },
    {
        name: 'Lab Manager',
        description: 'Laboratory Operations Manager supervising quality control, sample throughput, test catalog, technical validation, and operational audit trails.',
        dashboardPath: '/lab/dashboard',
        isSystemRole: true,
        hospitalId: null,
        navLinks: [
            { label: 'Dashboard', path: '/lab/dashboard' },
            { label: 'Orders', path: '/lab/orders' },
            { label: 'Samples', path: '/lab/samples' },
            { label: 'Test Catalog', path: '/lab/catalog' },
            { label: 'Reports', path: '/lab/reports' },
            { label: 'Audit Trail', path: '/lab/audit' }
        ],
        permissions: [
            'lab_view',
            'lab_manage',
            'patients:view',
            'patients:create',
            'patients:update',
            'orders:view',
            'orders:create',
            'orders:update',
            'samples:view',
            'samples:receive',
            'samples:process',
            'samples:verify',
            'samples:reject',
            'samples:recollect',
            'tests:view',
            'tests:manage',
            'tests:create',
            'tests:update',
            'results:enter',
            'results:edit_preliminary',
            'reports:view',
            'reports:create',
            'reports:verify',
            'reports:release',
            'reports:reject',
            'reports:download',
            'billing:view',
            'users:view',
            'roles:view',
            'audit:view',
            'settings:view'
        ]
    },
    {
        name: 'Lab Receptionist',
        description: 'Front-desk laboratory intake: patient demographic lookup, laboratory requisition creation, test selection, receipt printing, and invoice collection.',
        dashboardPath: '/lab/reception',
        isSystemRole: true,
        hospitalId: null,
        navLinks: [
            { label: 'Reception Queue', path: '/lab/reception' },
            { label: 'New Order', path: '/lab/orders/new' },
            { label: 'Orders Directory', path: '/lab/orders' },
            { label: 'Invoicing & Receipts', path: '/lab/billing' }
        ],
        permissions: [
            'lab_view',
            'patients:view',
            'patients:create',
            'patients:update',
            'orders:view',
            'orders:create',
            'orders:update',
            'samples:view',
            'tests:view',
            'reports:view',
            'reports:download',
            'billing:view',
            'billing:invoice_create',
            'billing:collect_payment'
        ]
    },
    {
        name: 'Phlebotomist / Sample Collector',
        description: 'Phlebotomy and specimen collection specialist: tube selection, Code 128 barcode label generation, specimen draw confirmation, and recollection processing.',
        dashboardPath: '/lab/collection',
        isSystemRole: true,
        hospitalId: null,
        navLinks: [
            { label: 'Collection Queue', path: '/lab/collection' },
            { label: 'Recollections', path: '/lab/recollections' },
            { label: 'Specimen History', path: '/lab/specimens' }
        ],
        permissions: [
            'lab_view',
            'patients:view',
            'orders:view',
            'samples:view',
            'samples:collect',
            'samples:recollect',
            'reports:view'
        ]
    },
    {
        name: 'Lab Technician',
        description: 'Medical Laboratory Technician: specimen accessioning, bench testing, analyzer findings entry, normal/critical auto-flagging, and preliminary report drafting.',
        dashboardPath: '/lab/bench',
        isSystemRole: true,
        hospitalId: null,
        navLinks: [
            { label: 'Bench Queue', path: '/lab/bench' },
            { label: 'Accessioning', path: '/lab/samples' },
            { label: 'Draft Reports', path: '/lab/reports' },
            { label: 'Assigned Tests', path: '/lab/tests' }
        ],
        permissions: [
            'lab_view',
            'lab_manage',
            'patients:view',
            'orders:view',
            'samples:view',
            'samples:receive',
            'samples:process',
            'samples:verify',
            'samples:reject',
            'tests:view',
            'results:enter',
            'results:edit_preliminary',
            'reports:view',
            'reports:create',
            'reports:download'
        ]
    },
    {
        name: 'Pathologist',
        description: 'Consultant Pathologist: clinical verification, reference range evaluation, electronic sign-off, diagnostic report release, and specimen rejection.',
        dashboardPath: '/lab/verification',
        isSystemRole: true,
        hospitalId: null,
        navLinks: [
            { label: 'Verification Queue', path: '/lab/verification' },
            { label: 'Diagnostic Reports', path: '/lab/reports' },
            { label: 'Test Catalog', path: '/lab/catalog' },
            { label: 'Audit Trail', path: '/lab/audit' }
        ],
        permissions: [
            'lab_view',
            'patients:view',
            'orders:view',
            'samples:view',
            'samples:verify',
            'samples:reject',
            'samples:recollect',
            'tests:view',
            'results:enter',
            'results:edit_preliminary',
            'reports:view',
            'reports:create',
            'reports:verify',
            'reports:release',
            'reports:reject',
            'reports:download',
            'audit:view'
        ]
    },
    {
        name: 'Lab Accountant',
        description: 'Laboratory financial officer: invoice settlement, discount approvals, payment reconciliation (Cash, UPI, Card), refund processing, and daily lab revenue analysis.',
        dashboardPath: '/lab/billing',
        isSystemRole: true,
        hospitalId: null,
        navLinks: [
            { label: 'Lab Invoicing', path: '/lab/billing' },
            { label: 'Invoices', path: '/lab/invoices' },
            { label: 'Refunds', path: '/lab/refunds' },
            { label: 'Revenue Analytics', path: '/lab/revenue' }
        ],
        permissions: [
            'lab_view',
            'finance_view',
            'patients:view',
            'orders:view',
            'billing:view',
            'billing:manage',
            'billing:invoice_create',
            'billing:collect_payment',
            'billing:discount',
            'billing:discount:approve',
            'billing:refund',
            'billing:refund:approve',
            'billing:advance:create',
            'billing:advance:adjust',
            'billing:reports:view',
            'billing:cash_register:view',
            'billing:cash_register:close'
        ]
    }
];

// Helper: check if a role name is an LMS role
function isLabRole(roleName) {
    if (!roleName) return false;
    const lower = String(roleName).toLowerCase().trim();
    return (
        lower.includes('lab') ||
        lower.includes('pathologist') ||
        lower.includes('phlebotomist') ||
        lower.includes('sample collector')
    );
}

module.exports = {
    LMS_PERMISSIONS,
    LMS_ROLE_TEMPLATES,
    isLabRole
};
