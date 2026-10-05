/**
 * dependencyResolver.js — Dependency-aware processing and topological sorting for entities.
 *
 * Ensures that master records (Departments, Doctors, Patients, Medicines)
 * are processed and staged before transactional records (Appointments,
 * Admissions, Prescriptions, Invoices, Payments) that reference them.
 */

const ENTITY_DEPENDENCY_GRAPH = {
    Department: [],
    Medicine: [],
    Doctor: ['Department'],
    Patient: [],
    Service: ['Department'],
    Inventory: ['Medicine'],
    Appointment: ['Patient', 'Doctor', 'Department'],
    Admission: ['Patient', 'Doctor', 'Department'],
    Lab: ['Department'],
    Prescription: ['Patient', 'Doctor', 'Medicine'],
    Invoice: ['Patient'],
    Payment: ['Patient', 'Invoice', 'Appointment']
};

// Default canonical processing order
const CANONICAL_DEPENDENCY_ORDER = [
    'Department',
    'Medicine',
    'Doctor',
    'Patient',
    'Service',
    'Inventory',
    'Appointment',
    'Admission',
    'Lab',
    'Prescription',
    'Invoice',
    'Payment'
];

/**
 * Foreign key / relationship definitions per entity.
 * Defines which fields in an entity point to target entities and their expected identifier keys.
 */
const ENTITY_RELATIONSHIPS = {
    Appointment: [
        {
            sourceField: 'uhid',
            targetEntity: 'Patient',
            targetKey: 'uhid',
            required: false,
            description: 'Patient UHID/MRN reference'
        },
        {
            sourceField: 'patientPhone',
            targetEntity: 'Patient',
            targetKey: 'phone',
            required: false,
            description: 'Patient phone number reference'
        },
        {
            sourceField: 'patientName',
            targetEntity: 'Patient',
            targetKey: 'name',
            required: true,
            description: 'Patient name reference'
        },
        {
            sourceField: 'doctorName',
            targetEntity: 'Doctor',
            targetKey: 'name',
            required: true,
            description: 'Consulting Doctor name reference'
        },
        {
            sourceField: 'department',
            targetEntity: 'Department',
            targetKey: 'name',
            required: false,
            description: 'Department reference'
        }
    ],

    Admission: [
        {
            sourceField: 'uhid',
            targetEntity: 'Patient',
            targetKey: 'uhid',
            required: false,
            description: 'Patient UHID/MRN reference'
        },
        {
            sourceField: 'patientName',
            targetEntity: 'Patient',
            targetKey: 'name',
            required: true,
            description: 'Inpatient name reference'
        },
        {
            sourceField: 'doctorName',
            targetEntity: 'Doctor',
            targetKey: 'name',
            required: false,
            description: 'Admitting doctor reference'
        }
    ],

    Prescription: [
        {
            sourceField: 'uhid',
            targetEntity: 'Patient',
            targetKey: 'uhid',
            required: false,
            description: 'Patient UHID reference'
        },
        {
            sourceField: 'patientName',
            targetEntity: 'Patient',
            targetKey: 'name',
            required: false,
            description: 'Patient name reference'
        },
        {
            sourceField: 'medicineName',
            targetEntity: 'Medicine',
            targetKey: 'name',
            required: true,
            description: 'Prescribed medicine reference'
        }
    ],

    Payment: [
        {
            sourceField: 'uhid',
            targetEntity: 'Patient',
            targetKey: 'uhid',
            required: false,
            description: 'Patient UHID reference'
        },
        {
            sourceField: 'patientName',
            targetEntity: 'Patient',
            targetKey: 'name',
            required: false,
            description: 'Patient name reference'
        }
    ],

    Invoice: [
        {
            sourceField: 'patientName',
            targetEntity: 'Patient',
            targetKey: 'name',
            required: false,
            description: 'Patient name reference'
        }
    ],

    Doctor: [
        {
            sourceField: 'specialty',
            targetEntity: 'Department',
            targetKey: 'name',
            required: false,
            description: 'Department/Specialty reference'
        }
    ]
};

/**
 * Sort a list of entity names in dependency-aware order.
 * Unknown entities are appended at the end.
 */
function orderEntities(entities = []) {
    const unique = Array.from(new Set(entities));
    return unique.sort((a, b) => {
        const idxA = CANONICAL_DEPENDENCY_ORDER.indexOf(a);
        const idxB = CANONICAL_DEPENDENCY_ORDER.indexOf(b);
        const rankA = idxA === -1 ? 999 : idxA;
        const rankB = idxB === -1 ? 999 : idxB;
        return rankA - rankB;
    });
}

/**
 * Sort session files by the dependency order of their detected entities.
 */
function sortFilesByDependency(files = []) {
    return [...files].sort((a, b) => {
        const entityA = a.detectedEntity || 'Unknown';
        const entityB = b.detectedEntity || 'Unknown';
        const idxA = CANONICAL_DEPENDENCY_ORDER.indexOf(entityA);
        const idxB = CANONICAL_DEPENDENCY_ORDER.indexOf(entityB);
        const rankA = idxA === -1 ? 999 : idxA;
        const rankB = idxB === -1 ? 999 : idxB;
        return rankA - rankB;
    });
}

/**
 * Get defined relationship rules for an entity.
 */
function getEntityRelationships(entity) {
    return ENTITY_RELATIONSHIPS[entity] || [];
}

module.exports = {
    ENTITY_DEPENDENCY_GRAPH,
    CANONICAL_DEPENDENCY_ORDER,
    ENTITY_RELATIONSHIPS,
    orderEntities,
    sortFilesByDependency,
    getEntityRelationships
};
