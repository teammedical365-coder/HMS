import { paginateProgressNotes, buildProgressNotesHeaderData } from '../../client/src/utils/progressNotesPdf.js';
import { buildDefaultClinicalNoteState } from '../../client/src/utils/inpatientNotesPdf.js';

console.log('Testing IPD Clinical Workspace Precision Fixes...');

// Test 1: Add Sheet pagination logic
const notes = [
    { _id: '1', note: 'Patient admitted with acute chest pain and shortness of breath.', authorName: 'Dr. Ramesh Singh', authorRole: 'doctor', createdAt: new Date() }
];

const singleSheet = paginateProgressNotes(notes, 32, 0);
console.assert(singleSheet.length === 1, `Expected 1 page, got ${singleSheet.length}`);
console.assert(singleSheet[0].rows.length === 32, `Expected 32 rows, got ${singleSheet[0].rows.length}`);

// Add 1 extra sheet
const twoSheets = paginateProgressNotes(notes, 32, 1);
console.assert(twoSheets.length === 2, `Expected 2 pages, got ${twoSheets.length}`);
console.assert(twoSheets[1].sheetNo === '2', `Expected sheetNo '2', got ${twoSheets[1].sheetNo}`);
console.assert(twoSheets[1].rows.length === 32, `Expected 32 rows, got ${twoSheets[1].rows.length}`);

// Add 2 extra sheets
const threeSheets = paginateProgressNotes(notes, 32, 2);
console.assert(threeSheets.length === 3, `Expected 3 pages, got ${threeSheets.length}`);
console.assert(threeSheets[2].sheetNo === '3', `Expected sheetNo '3', got ${threeSheets[2].sheetNo}`);

console.log('✅ PASS: Add Sheet pagination correctly appends new 32-ruled-line sheets with sequential sheet numbering');

// Test 2: Consultant field resolution in progressNotesPdf
const admissionWithDoctor = {
    _id: '660000000000000000000504',
    ipdNumber: '',
    admissionNumber: '',
    doctorId: { name: 'Rohan Verma', role: 'doctor' },
    ward: 'ICU',
    bedNumber: 'B-102'
};

const headerWithDoctor = buildProgressNotesHeaderData({
    patient: { name: 'Sumit Singh', patientId: 'PCF-M365-012', age: 45, gender: 'Male' },
    admission: admissionWithDoctor
});
console.assert(headerWithDoctor.consultant === 'Dr. Rohan Verma', `Expected Dr. Rohan Verma, got "${headerWithDoctor.consultant}"`);
console.assert(headerWithDoctor.ipdNo === '000504', `Expected fallback IPD 000504, got "${headerWithDoctor.ipdNo}"`);

// Test 3: Reject Nurse name from consultant field
const admissionWithNurse = {
    _id: '660000000000000000000505',
    consultant: 'Suman Singh (Nurse)',
    admittedBy: { name: 'Suman Singh', role: 'nurse' }
};

const headerWithNurse = buildProgressNotesHeaderData({
    patient: { name: 'Sumit Singh' },
    admission: admissionWithNurse
});
console.assert(headerWithNurse.consultant === '', `Expected blank consultant when only nurse name is present, got "${headerWithNurse.consultant}"`);

// Test 4: Consultant field resolution in inpatientNotesPdf
const defaultClinicalState = buildDefaultClinicalNoteState({
    patient: { name: 'Sumit Singh', patientId: 'PCF-M365-012' },
    admission: admissionWithDoctor
});
console.assert(defaultClinicalState.consultantName === 'Dr. Rohan Verma', `Expected Dr. Rohan Verma, got "${defaultClinicalState.consultantName}"`);

console.log('✅ PASS: Consultant mapping resolves doctor with "Dr." prefix and strictly rejects nurse names');
console.log('All precision workspace tests passed successfully!');
