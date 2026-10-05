/**
 * canonicalSchema.js — Canonical schema registry for Medical365 HMS entities.
 *
 * Strict validation guarantee:
 * Target fields suggested by AI or selected by users MUST exist in this registry.
 * AI cannot invent arbitrary model paths, Mongo operators, or unknown attributes.
 */

const CANONICAL_SCHEMAS = {
    Patient: [
        { fieldName: 'name', label: 'Full Name', dataType: 'String', required: true, description: 'Full legal name of the patient', aliases: ['patient_name', 'patientname', 'name', 'p_name', 'full_name', 'fullname'] },
        { fieldName: 'firstName', label: 'First Name', dataType: 'String', required: false, description: 'Given / first name', aliases: ['first_name', 'firstname', 'fname', 'first'] },
        { fieldName: 'lastName', label: 'Last Name', dataType: 'String', required: false, description: 'Surname / family name', aliases: ['last_name', 'lastname', 'lname', 'surname'] },
        { fieldName: 'phone', label: 'Mobile Number', dataType: 'String', required: true, description: '10-digit primary mobile phone number', aliases: ['mobile', 'mobile_no', 'phone', 'contact', 'cell', 'phonenumber', 'contact_no', 'telephone'] },
        { fieldName: 'email', label: 'Email Address', dataType: 'String', required: false, description: 'Patient email address', aliases: ['email', 'email_address', 'mail', 'email_id'] },
        { fieldName: 'gender', label: 'Gender / Sex', dataType: 'String', required: false, description: 'Gender identity (Male, Female, Other)', aliases: ['gender', 'sex', 'm_f'] },
        { fieldName: 'dob', label: 'Date of Birth', dataType: 'Date', required: false, description: 'Birth date in ISO/Standard format', aliases: ['dob', 'date_of_birth', 'birth_date', 'birthdate', 'bdate'] },
        { fieldName: 'age', label: 'Age', dataType: 'Number', required: false, description: 'Age in years', aliases: ['age', 'patient_age', 'years'] },
        { fieldName: 'bloodGroup', label: 'Blood Group', dataType: 'String', required: false, description: 'ABO blood type (e.g. O+, A+, B-)', aliases: ['blood_group', 'bloodgroup', 'blood_grp', 'bg', 'blood'] },
        { fieldName: 'uhid', label: 'UHID / MRN', dataType: 'String', required: false, description: 'Unique Hospital Identification / Medical Record Number', aliases: ['uhid', 'mrn', 'patient_id', 'patientid', 'hospital_id', 'op_number', 'reg_no', 'registration_no'] },
        { fieldName: 'aadhaarNumber', label: 'Aadhaar / National ID', dataType: 'String', required: false, description: '12-digit Indian national identity number', aliases: ['aadhaar', 'aadhaar_number', 'aadhaarno', 'national_id', 'uid'] },
        { fieldName: 'panNumber', label: 'PAN Card Number', dataType: 'String', required: false, description: 'Permanent Account Number', aliases: ['pan', 'pan_number', 'panno'] },
        { fieldName: 'maritalStatus', label: 'Marital Status', dataType: 'String', required: false, description: 'Single, Married, Divorced, Widowed', aliases: ['marital_status', 'maritalstatus', 'marriage_status'] },
        { fieldName: 'occupation', label: 'Occupation', dataType: 'String', required: false, description: 'Profession or occupation', aliases: ['occupation', 'profession', 'job'] },
        { fieldName: 'address', label: 'Full Address', dataType: 'String', required: false, description: 'Full residential address', aliases: ['address', 'residence', 'residential_address', 'addr'] },
        { fieldName: 'city', label: 'City', dataType: 'String', required: false, description: 'City / Municipality', aliases: ['city', 'town', 'district'] },
        { fieldName: 'state', label: 'State / Province', dataType: 'String', required: false, description: 'State or Union Territory', aliases: ['state', 'province'] },
        { fieldName: 'zipCode', label: 'PIN / Zip Code', dataType: 'String', required: false, description: '6-digit postal pin code', aliases: ['pincode', 'pin_code', 'zip', 'zip_code', 'postal_code'] },
        { fieldName: 'country', label: 'Country', dataType: 'String', required: false, description: 'Country of residence', aliases: ['country', 'nation'] },
        { fieldName: 'alternateMobile', label: 'Alternate Contact', dataType: 'String', required: false, description: 'Secondary mobile or phone number', aliases: ['alt_mobile', 'alternate_mobile', 'alt_phone', 'secondary_phone'] },
        { fieldName: 'emergencyContactName', label: 'Emergency Contact Person', dataType: 'String', required: false, description: 'Kin or contact person in case of emergency', aliases: ['emergency_contact_name', 'guardian_name', 'relative_name', 'next_of_kin'] },
        { fieldName: 'emergencyContactPhone', label: 'Emergency Contact Phone', dataType: 'String', required: false, description: 'Phone number for emergency contact', aliases: ['emergency_phone', 'emergency_contact_number', 'guardian_phone'] }
    ],

    Doctor: [
        { fieldName: 'name', label: 'Doctor Name', dataType: 'String', required: true, description: 'Doctor full name with prefix', aliases: ['doctor_name', 'doc_name', 'dr_name', 'name', 'physician'] },
        { fieldName: 'doctorId', label: 'Doctor ID / Code', dataType: 'String', required: false, description: 'Hospital employee or registration code', aliases: ['doctor_id', 'doc_id', 'emp_id', 'employee_id', 'physician_id'] },
        { fieldName: 'email', label: 'Email Address', dataType: 'String', required: true, description: 'Professional or login email address', aliases: ['email', 'email_address', 'doc_email'] },
        { fieldName: 'phone', label: 'Phone Number', dataType: 'String', required: true, description: 'Contact mobile number', aliases: ['phone', 'mobile', 'contact_no', 'doc_phone'] },
        { fieldName: 'specialty', label: 'Specialty / Department', dataType: 'String', required: false, description: 'Clinical medical specialty', aliases: ['specialty', 'speciality', 'department', 'discipline'] },
        { fieldName: 'experience', label: 'Years of Experience', dataType: 'String', required: false, description: 'Clinical experience overview', aliases: ['experience', 'years_of_experience', 'exp'] },
        { fieldName: 'education', label: 'Qualifications / Degrees', dataType: 'String', required: false, description: 'e.g. MBBS, MD, MS, DNB', aliases: ['qualification', 'qualifications', 'education', 'degree'] },
        { fieldName: 'opdFee', label: 'OPD Consultation Fee', dataType: 'Number', required: false, description: 'Standard outpatient consultation fee', aliases: ['consultation_fee', 'opd_fee', 'fee', 'charge'] }
    ],

    Appointment: [
        { fieldName: 'patientName', label: 'Patient Name', dataType: 'String', required: true, description: 'Patient name for appointment', aliases: ['patient_name', 'patient', 'name'] },
        { fieldName: 'patientPhone', label: 'Patient Phone', dataType: 'String', required: false, description: 'Patient phone number', aliases: ['patient_phone', 'mobile', 'phone'] },
        { fieldName: 'uhid', label: 'UHID / Patient ID', dataType: 'String', required: false, description: 'Hospital ID of patient', aliases: ['uhid', 'patient_id', 'mrn'] },
        { fieldName: 'doctorName', label: 'Doctor Name', dataType: 'String', required: true, description: 'Attending consultant doctor', aliases: ['doctor_name', 'doctor', 'physician'] },
        { fieldName: 'appointmentDate', label: 'Appointment Date', dataType: 'Date', required: true, description: 'Scheduled date of consultation', aliases: ['appointment_date', 'date', 'appt_date', 'booking_date'] },
        { fieldName: 'appointmentTime', label: 'Time / Slot', dataType: 'String', required: false, description: 'Time or time slot string', aliases: ['appointment_time', 'time', 'slot', 'time_slot'] },
        { fieldName: 'tokenNumber', label: 'Token Number', dataType: 'Number', required: false, description: 'Queue token or slip number', aliases: ['token', 'token_no', 'token_number', 'queue_no', 'slip_no'] },
        { fieldName: 'department', label: 'Department', dataType: 'String', required: false, description: 'Clinical department', aliases: ['department', 'dept', 'specialty'] },
        { fieldName: 'status', label: 'Status', dataType: 'String', required: false, description: 'Scheduled, Completed, Cancelled', aliases: ['status', 'appointment_status', 'state'] },
        { fieldName: 'fee', label: 'Consultation Fee', dataType: 'Number', required: false, description: 'Charged consultation fee', aliases: ['fee', 'amount', 'consultation_fee', 'price'] },
        { fieldName: 'visitType', label: 'Visit Type', dataType: 'String', required: false, description: 'New Consultation, Follow-up', aliases: ['visit_type', 'type', 'consultation_type'] },
        { fieldName: 'notes', label: 'Clinical Notes / Reason', dataType: 'String', required: false, description: 'Complaints or reason for appointment', aliases: ['notes', 'remarks', 'reason', 'chief_complaint'] }
    ],

    Admission: [
        { fieldName: 'patientName', label: 'Patient Name', dataType: 'String', required: true, description: 'Inpatient name', aliases: ['patient_name', 'patient', 'name'] },
        { fieldName: 'uhid', label: 'UHID / IP Number', dataType: 'String', required: false, description: 'IP or Hospital ID', aliases: ['uhid', 'ip_number', 'ipd_no', 'admission_no', 'mrn'] },
        { fieldName: 'doctorName', label: 'Admitting Doctor', dataType: 'String', required: false, description: 'Primary attending doctor', aliases: ['doctor_name', 'doctor', 'admitting_doctor'] },
        { fieldName: 'admissionDate', label: 'Admission Date', dataType: 'Date', required: true, description: 'Date of IPD admission', aliases: ['admission_date', 'admitted_on', 'admit_date', 'doa'] },
        { fieldName: 'dischargeDate', label: 'Discharge Date', dataType: 'Date', required: false, description: 'Date of discharge if released', aliases: ['discharge_date', 'discharged_on', 'dod'] },
        { fieldName: 'ward', label: 'Ward / Unit', dataType: 'String', required: false, description: 'Ward name or category (e.g. ICU, General Ward)', aliases: ['ward', 'ward_name', 'unit', 'wing'] },
        { fieldName: 'bedNumber', label: 'Bed Number', dataType: 'String', required: false, description: 'Bed identifier number', aliases: ['bed_number', 'bed_no', 'bed'] },
        { fieldName: 'status', label: 'Status', dataType: 'String', required: false, description: 'Admitted, Discharged', aliases: ['status', 'admission_status', 'patient_status'] },
        { fieldName: 'diagnosis', label: 'Provisional / Final Diagnosis', dataType: 'String', required: false, description: 'Clinical condition', aliases: ['diagnosis', 'reason', 'disease'] },
        { fieldName: 'totalAmount', label: 'Total Inpatient Bill', dataType: 'Number', required: false, description: 'Total charges for stay', aliases: ['total_amount', 'bill_amount', 'amount', 'charges'] }
    ],

    Department: [
        { fieldName: 'name', label: 'Department Name', dataType: 'String', required: true, description: 'Name of hospital department', aliases: ['department_name', 'dept_name', 'name', 'department'] },
        { fieldName: 'code', label: 'Department Code', dataType: 'String', required: false, description: 'Short unique identifier code', aliases: ['department_code', 'dept_code', 'code'] },
        { fieldName: 'description', label: 'Description', dataType: 'String', required: false, description: 'Department overview', aliases: ['description', 'details', 'notes'] },
        { fieldName: 'isActive', label: 'Is Active', dataType: 'Boolean', required: false, description: 'Active operational status', aliases: ['is_active', 'status', 'active'] }
    ],

    Service: [
        { fieldName: 'title', label: 'Service Title', dataType: 'String', required: true, description: 'Name of procedure or hospital service', aliases: ['service_title', 'service_name', 'title', 'name', 'procedure'] },
        { fieldName: 'description', label: 'Description', dataType: 'String', required: false, description: 'Details of service', aliases: ['description', 'details'] },
        { fieldName: 'price', label: 'Standard Price', dataType: 'Number', required: true, description: 'Tariff or fee in local currency', aliases: ['price', 'fee', 'charge', 'rate', 'cost'] },
        { fieldName: 'category', label: 'Service Category', dataType: 'String', required: false, description: 'OPD, Diagnostic, OT, etc.', aliases: ['category', 'service_category', 'type'] },
        { fieldName: 'duration', label: 'Estimated Duration', dataType: 'String', required: false, description: 'Expected duration', aliases: ['duration', 'time_taken'] }
    ],

    Medicine: [
        { fieldName: 'name', label: 'Medicine Brand Name', dataType: 'String', required: true, description: 'Commercial brand name', aliases: ['medicine_name', 'brand_name', 'drug_name', 'name', 'item_name'] },
        { fieldName: 'genericName', label: 'Generic / Salt Name', dataType: 'String', required: false, description: 'Chemical salt formulation', aliases: ['generic_name', 'salt_name', 'salt', 'composition', 'molecule'] },
        { fieldName: 'category', label: 'Category / Form', dataType: 'String', required: false, description: 'Tablet, Syrup, Injection, Capsule', aliases: ['category', 'form', 'dosage_form', 'type'] },
        { fieldName: 'description', label: 'Description / Usage', dataType: 'String', required: false, description: 'Dosage instructions or notes', aliases: ['description', 'usage', 'instructions'] }
    ],

    Inventory: [
        { fieldName: 'name', label: 'Item / Medicine Name', dataType: 'String', required: true, description: 'Product or medicine item name', aliases: ['item_name', 'name', 'product_name', 'medicine_name'] },
        { fieldName: 'salt', label: 'Salt / Generic Composition', dataType: 'String', required: false, description: 'Active chemical ingredient', aliases: ['salt', 'generic_name', 'composition'] },
        { fieldName: 'category', label: 'Inventory Category', dataType: 'String', required: false, description: 'Consumable, Pharmacy, Surgical', aliases: ['category', 'item_category', 'type'] },
        { fieldName: 'stock', label: 'Current Quantity / Stock', dataType: 'Number', required: true, description: 'Available quantity in stock', aliases: ['stock', 'quantity', 'qty', 'current_stock', 'balance'] },
        { fieldName: 'unit', label: 'Unit of Measure', dataType: 'String', required: false, description: 'Strip, Box, Vial, Piece, Bottle', aliases: ['unit', 'uom', 'pack_unit', 'unit_name'] },
        { fieldName: 'batchNumber', label: 'Batch / Lot Number', dataType: 'String', required: false, description: 'Manufacturer batch ID', aliases: ['batch_no', 'batch_number', 'batch', 'lot_number', 'lot_no'] },
        { fieldName: 'expiryDate', label: 'Expiry Date', dataType: 'Date', required: false, description: 'Expiration date', aliases: ['expiry_date', 'expiry', 'exp_date', 'exp'] },
        { fieldName: 'buyingPrice', label: 'Purchase / Cost Price', dataType: 'Number', required: false, description: 'Procurement price per unit', aliases: ['buying_price', 'purchase_price', 'cost_price', 'cost'] },
        { fieldName: 'sellingPrice', label: 'Selling Price / MRP', dataType: 'Number', required: false, description: 'Retail price to patient', aliases: ['selling_price', 'mrp', 'sale_price', 'retail_price', 'rate'] },
        { fieldName: 'vendor', label: 'Supplier / Vendor Name', dataType: 'String', required: false, description: 'Distributor or supplier', aliases: ['vendor', 'supplier', 'distributor', 'vendor_name'] }
    ],

    Payment: [
        { fieldName: 'patientName', label: 'Patient Name', dataType: 'String', required: false, description: 'Patient making payment', aliases: ['patient_name', 'patient', 'name'] },
        { fieldName: 'uhid', label: 'UHID / Receipt No', dataType: 'String', required: false, description: 'Patient MRN or billing receipt number', aliases: ['uhid', 'patient_id', 'receipt_no', 'bill_no'] },
        { fieldName: 'amount', label: 'Paid Amount', dataType: 'Number', required: true, description: 'Transaction amount in INR', aliases: ['amount', 'paid_amount', 'total_amount', 'net_amount'] },
        { fieldName: 'paymentMode', label: 'Payment Mode', dataType: 'String', required: false, description: 'Cash, UPI, Card, NetBanking', aliases: ['payment_mode', 'mode', 'method', 'payment_method', 'type'] },
        { fieldName: 'paymentStatus', label: 'Payment Status', dataType: 'String', required: false, description: 'Paid, Pending, Failed, Refunded', aliases: ['payment_status', 'status'] },
        { fieldName: 'transactionId', label: 'Transaction / UTR ID', dataType: 'String', required: false, description: 'Bank or gateway reference code', aliases: ['transaction_id', 'tx_id', 'utr', 'ref_no', 'reference_id'] },
        { fieldName: 'paymentDate', label: 'Payment Date', dataType: 'Date', required: true, description: 'Date transaction was executed', aliases: ['payment_date', 'date', 'tx_date', 'paid_on'] },
        { fieldName: 'description', label: 'Bill Description / Purpose', dataType: 'String', required: false, description: 'Remarks or bill item summary', aliases: ['description', 'remarks', 'purpose', 'notes'] }
    ],

    Invoice: [
        { fieldName: 'invoiceNumber', label: 'Invoice Number', dataType: 'String', required: true, description: 'Unique invoice document number', aliases: ['invoice_no', 'invoice_number', 'bill_no', 'bill_number'] },
        { fieldName: 'patientName', label: 'Patient / Client Name', dataType: 'String', required: false, description: 'Billed patient or party', aliases: ['patient_name', 'customer_name', 'party_name'] },
        { fieldName: 'invoiceDate', label: 'Invoice Date', dataType: 'Date', required: true, description: 'Date invoice was issued', aliases: ['invoice_date', 'date', 'bill_date'] },
        { fieldName: 'totalAmount', label: 'Total Invoice Amount', dataType: 'Number', required: true, description: 'Gross bill amount', aliases: ['total_amount', 'amount', 'grand_total', 'total'] },
        { fieldName: 'taxAmount', label: 'Tax / GST Amount', dataType: 'Number', required: false, description: 'Total tax levied', aliases: ['tax_amount', 'tax', 'gst'] },
        { fieldName: 'status', label: 'Invoice Status', dataType: 'String', required: false, description: 'Draft, Issued, Paid, Cancelled', aliases: ['status', 'invoice_status'] }
    ],

    Lab: [
        { fieldName: 'name', label: 'Test Name', dataType: 'String', required: true, description: 'Name of diagnostic investigation', aliases: ['test_name', 'name', 'investigation', 'test'] },
        { fieldName: 'code', label: 'Test Code', dataType: 'String', required: false, description: 'Short unique lab code', aliases: ['test_code', 'code', 'lab_code'] },
        { fieldName: 'category', label: 'Category / Department', dataType: 'String', required: false, description: 'Hematology, Biochemistry, Radiology', aliases: ['category', 'test_category', 'department'] },
        { fieldName: 'price', label: 'Standard Rate', dataType: 'Number', required: true, description: 'Charge for the test', aliases: ['price', 'rate', 'cost', 'fee'] },
        { fieldName: 'description', label: 'Test Description', dataType: 'String', required: false, description: 'Sample type and preparation notes', aliases: ['description', 'sample_type', 'notes'] }
    ],

    Prescription: [
        { fieldName: 'patientName', label: 'Patient Name', dataType: 'String', required: false, description: 'Patient being prescribed', aliases: ['patient_name', 'patient'] },
        { fieldName: 'medicineName', label: 'Prescribed Medicine', dataType: 'String', required: true, description: 'Brand or generic drug name', aliases: ['medicine_name', 'medicine', 'drug', 'item'] },
        { fieldName: 'saltName', label: 'Active Salt', dataType: 'String', required: false, description: 'Generic salt formulation', aliases: ['salt_name', 'salt', 'generic_name'] },
        { fieldName: 'frequency', label: 'Dosage Frequency', dataType: 'String', required: false, description: 'e.g. 1-0-1, OD, BD, TDS', aliases: ['frequency', 'dosage', 'regimen'] },
        { fieldName: 'duration', label: 'Duration', dataType: 'String', required: false, description: 'e.g. 5 days, 1 month', aliases: ['duration', 'days', 'period'] },
        { fieldName: 'instructions', label: 'Special Instructions', dataType: 'String', required: false, description: 'After food, empty stomach, etc.', aliases: ['instructions', 'remarks', 'directions'] }
    ]
};

/**
 * Returns canonical fields list for a specific entity.
 */
function getCanonicalFields(entity) {
    return CANONICAL_SCHEMAS[entity] || [];
}

/**
 * Validates if targetField is a strictly approved canonical field for this entity.
 */
function isValidCanonicalField(entity, targetField) {
    if (!entity || !targetField) return false;
    const fields = CANONICAL_SCHEMAS[entity];
    if (!fields) return false;
    return fields.some(f => f.fieldName === targetField);
}

/**
 * Returns all supported entities.
 */
function getSupportedEntities() {
    return Object.keys(CANONICAL_SCHEMAS);
}

module.exports = {
    CANONICAL_SCHEMAS,
    getCanonicalFields,
    isValidCanonicalField,
    getSupportedEntities
};
