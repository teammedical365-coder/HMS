/**
 * Real-Time Monitoring — Mock Data
 * ═══════════════════════════════════
 * All mock data for the monitoring UI is isolated here.
 * Replace these exports with real API calls when backend is ready.
 */

// ── Patients ──────────────────────────────────────────────
export const MOCK_PATIENTS = [
  {
    id: 'p1',
    name: 'Ramesh Patel',
    mrn: 'PCF-M365-001',
    age: 56,
    gender: 'Male',
    ward: 'ICU',
    bed: 'Bed 03',
    status: 'critical',
    admittedAt: '2026-09-16T10:30:00',
    devices: ['ecg', 'ventilator', 'spo2'],
    photo: null,
  },
  {
    id: 'p2',
    name: 'Sunita Sharma',
    mrn: 'PCF-M365-002',
    age: 42,
    gender: 'Female',
    ward: 'Ward B',
    bed: 'Bed 14',
    status: 'attention',
    admittedAt: '2026-09-18T08:15:00',
    devices: ['monitor', 'infusion'],
    photo: null,
  },
  {
    id: 'p3',
    name: 'Arun Mehta',
    mrn: 'PCF-M365-003',
    age: 68,
    gender: 'Male',
    ward: 'Ward C',
    bed: 'Bed 07',
    status: 'stable',
    admittedAt: '2026-09-19T14:00:00',
    devices: ['monitor', 'spo2'],
    photo: null,
  },
  {
    id: 'p4',
    name: 'Priya Nair',
    mrn: 'PCF-M365-004',
    age: 34,
    gender: 'Female',
    ward: 'ICU',
    bed: 'Bed 01',
    status: 'stable',
    admittedAt: '2026-09-20T06:45:00',
    devices: ['monitor', 'ecg'],
    photo: null,
  },
  {
    id: 'p5',
    name: 'Vikram Singh',
    mrn: 'PCF-M365-005',
    age: 72,
    gender: 'Male',
    ward: 'Ward A',
    bed: 'Bed 09',
    status: 'attention',
    admittedAt: '2026-09-17T22:10:00',
    devices: ['ventilator', 'infusion', 'ecg'],
    photo: null,
  },
  {
    id: 'p6',
    name: 'Meena Desai',
    mrn: 'PCF-M365-006',
    age: 49,
    gender: 'Female',
    ward: 'Ward B',
    bed: 'Bed 11',
    status: 'stable',
    admittedAt: '2026-09-21T09:30:00',
    devices: ['monitor'],
    photo: null,
  },
  {
    id: 'p7',
    name: 'Rajesh Kumar',
    mrn: 'PCF-M365-007',
    age: 61,
    gender: 'Male',
    ward: 'ICU',
    bed: 'Bed 05',
    status: 'stable',
    admittedAt: '2026-09-20T17:20:00',
    devices: ['monitor', 'spo2', 'ecg'],
    photo: null,
  },
  {
    id: 'p8',
    name: 'Anjali Verma',
    mrn: 'PCF-M365-008',
    age: 38,
    gender: 'Female',
    ward: 'Ward A',
    bed: 'Bed 02',
    status: 'stable',
    admittedAt: '2026-09-21T11:00:00',
    devices: ['monitor'],
    photo: null,
  },
  {
    id: 'p9',
    name: 'Suresh Reddy',
    mrn: 'PCF-M365-009',
    age: 55,
    gender: 'Male',
    ward: 'Ward C',
    bed: 'Bed 10',
    status: 'attention',
    admittedAt: '2026-09-19T20:45:00',
    devices: ['monitor', 'infusion'],
    photo: null,
  },
  {
    id: 'p10',
    name: 'Kavita Joshi',
    mrn: 'PCF-M365-010',
    age: 47,
    gender: 'Female',
    ward: 'ICU',
    bed: 'Bed 04',
    status: 'stable',
    admittedAt: '2026-09-22T02:30:00',
    devices: ['ecg', 'spo2', 'monitor'],
    photo: null,
  },
  {
    id: 'p11',
    name: 'Deepak Tiwari',
    mrn: 'PCF-M365-011',
    age: 63,
    gender: 'Male',
    ward: 'Ward A',
    bed: 'Bed 06',
    status: 'stable',
    admittedAt: '2026-09-21T15:10:00',
    devices: ['monitor'],
    photo: null,
  },
  {
    id: 'p12',
    name: 'Lakshmi Iyer',
    mrn: 'PCF-M365-012',
    age: 58,
    gender: 'Female',
    ward: 'Ward B',
    bed: 'Bed 08',
    status: 'stable',
    admittedAt: '2026-09-22T07:00:00',
    devices: ['monitor', 'spo2'],
    photo: null,
  },
];

// ── Devices ───────────────────────────────────────────────
export const MOCK_DEVICES = [
  {
    id: 'd1',
    name: 'Multipara Monitor',
    model: 'Mindray BeneVision N22',
    type: 'monitor',
    status: 'online',
    battery: 98,
    patientId: 'p1',
    ward: 'ICU',
    bed: 'Bed 03',
  },
  {
    id: 'd2',
    name: 'Infusion Pump',
    model: 'B. Braun Space',
    type: 'infusion',
    status: 'online',
    battery: 100,
    patientId: 'p1',
    ward: 'ICU',
    bed: 'Bed 03',
  },
  {
    id: 'd3',
    name: 'Ventilator',
    model: 'Dräger Evita V600',
    type: 'ventilator',
    status: 'online',
    battery: 99,
    patientId: 'p1',
    ward: 'ICU',
    bed: 'Bed 03',
  },
  {
    id: 'd4',
    name: 'ECG Monitor',
    model: 'Philips IntelliVue',
    type: 'ecg',
    status: 'online',
    battery: 97,
    patientId: 'p1',
    ward: 'ICU',
    bed: 'Bed 03',
  },
  {
    id: 'd5',
    name: 'Multipara Monitor',
    model: 'Mindray BeneVision N17',
    type: 'monitor',
    status: 'online',
    battery: 92,
    patientId: 'p2',
    ward: 'Ward B',
    bed: 'Bed 14',
  },
  {
    id: 'd6',
    name: 'Infusion Pump',
    model: 'Fresenius Kabi Agilia',
    type: 'infusion',
    status: 'warning',
    battery: 34,
    patientId: 'p2',
    ward: 'Ward B',
    bed: 'Bed 14',
  },
  {
    id: 'd7',
    name: 'Multipara Monitor',
    model: 'GE CARESCAPE B450',
    type: 'monitor',
    status: 'online',
    battery: 100,
    patientId: 'p3',
    ward: 'Ward C',
    bed: 'Bed 07',
  },
  {
    id: 'd8',
    name: 'Pulse Oximeter',
    model: 'Masimo Rad-97',
    type: 'spo2',
    status: 'online',
    battery: 88,
    patientId: 'p3',
    ward: 'Ward C',
    bed: 'Bed 07',
  },
  {
    id: 'd9',
    name: 'Multipara Monitor',
    model: 'Philips MX800',
    type: 'monitor',
    status: 'online',
    battery: 95,
    patientId: 'p4',
    ward: 'ICU',
    bed: 'Bed 01',
  },
  {
    id: 'd10',
    name: 'ECG Monitor',
    model: 'GE MAC 2000',
    type: 'ecg',
    status: 'online',
    battery: 91,
    patientId: 'p4',
    ward: 'ICU',
    bed: 'Bed 01',
  },
  {
    id: 'd11',
    name: 'Ventilator',
    model: 'Hamilton C6',
    type: 'ventilator',
    status: 'online',
    battery: 100,
    patientId: 'p5',
    ward: 'Ward A',
    bed: 'Bed 09',
  },
  {
    id: 'd12',
    name: 'Infusion Pump',
    model: 'BD Alaris',
    type: 'infusion',
    status: 'online',
    battery: 78,
    patientId: 'p5',
    ward: 'Ward A',
    bed: 'Bed 09',
  },
  {
    id: 'd13',
    name: 'ECG Monitor',
    model: 'Schiller AT-102',
    type: 'ecg',
    status: 'offline',
    battery: 12,
    patientId: 'p5',
    ward: 'Ward A',
    bed: 'Bed 09',
  },
  {
    id: 'd14',
    name: 'Multipara Monitor',
    model: 'Nihon Kohden',
    type: 'monitor',
    status: 'online',
    battery: 100,
    patientId: 'p6',
    ward: 'Ward B',
    bed: 'Bed 11',
  },
  {
    id: 'd15',
    name: 'Multipara Monitor',
    model: 'Mindray BeneVision N22',
    type: 'monitor',
    status: 'online',
    battery: 96,
    patientId: 'p7',
    ward: 'ICU',
    bed: 'Bed 05',
  },
  {
    id: 'd16',
    name: 'Pulse Oximeter',
    model: 'Masimo Rad-97',
    type: 'spo2',
    status: 'online',
    battery: 82,
    patientId: 'p7',
    ward: 'ICU',
    bed: 'Bed 05',
  },
  {
    id: 'd17',
    name: 'ECG Monitor',
    model: 'Philips IntelliVue',
    type: 'ecg',
    status: 'online',
    battery: 94,
    patientId: 'p7',
    ward: 'ICU',
    bed: 'Bed 05',
  },
  {
    id: 'd18',
    name: 'Multipara Monitor',
    model: 'GE CARESCAPE B650',
    type: 'monitor',
    status: 'online',
    battery: 100,
    patientId: 'p8',
    ward: 'Ward A',
    bed: 'Bed 02',
  },
  {
    id: 'd19',
    name: 'Multipara Monitor',
    model: 'Mindray BeneVision N15',
    type: 'monitor',
    status: 'online',
    battery: 89,
    patientId: 'p9',
    ward: 'Ward C',
    bed: 'Bed 10',
  },
  {
    id: 'd20',
    name: 'Infusion Pump',
    model: 'B. Braun Space',
    type: 'infusion',
    status: 'disconnected',
    battery: 0,
    patientId: 'p9',
    ward: 'Ward C',
    bed: 'Bed 10',
  },
];

// ── Vitals (keyed by patientId) ───────────────────────────
export const MOCK_VITALS = {
  p1: {
    heartRate:    { value: 118, unit: 'bpm',    status: 'high',   trend: [82, 88, 95, 102, 108, 112, 115, 118, 116, 118] },
    spo2:         { value: 91,  unit: '%',      status: 'low',    trend: [97, 96, 95, 94, 93, 92, 91, 91, 92, 91] },
    bloodPressure:{ value: '160/95', systolic: 160, diastolic: 95, unit: 'mmHg', status: 'high', trend: [138, 142, 148, 152, 155, 158, 160, 159, 161, 160] },
    temperature:  { value: 100.4, unit: '°F',   status: 'high',   trend: [98.8, 99.0, 99.2, 99.6, 99.8, 100.0, 100.2, 100.4, 100.3, 100.4] },
    respRate:     { value: 24,  unit: '/min',   status: 'high',   trend: [16, 18, 19, 20, 21, 22, 23, 24, 23, 24] },
    map:          { value: 117, unit: 'mmHg',   status: 'high',   trend: [95, 98, 102, 106, 110, 113, 115, 117, 116, 117] },
    etco2:        { value: 32,  unit: 'mmHg',   status: 'normal', trend: [35, 34, 34, 33, 33, 32, 32, 32, 33, 32] },
    bloodSugar:   { value: 142, unit: 'mg/dL',  status: 'high',   trend: [110, 115, 120, 125, 130, 135, 138, 140, 141, 142] },
  },
  p2: {
    heartRate:    { value: 96,  unit: 'bpm',    status: 'high',   trend: [78, 80, 82, 85, 88, 90, 93, 95, 96, 96] },
    spo2:         { value: 94,  unit: '%',      status: 'low',    trend: [98, 97, 97, 96, 96, 95, 95, 94, 94, 94] },
    bloodPressure:{ value: '142/88', systolic: 142, diastolic: 88, unit: 'mmHg', status: 'high', trend: [128, 130, 132, 134, 136, 138, 140, 141, 142, 142] },
    temperature:  { value: 99.6, unit: '°F',    status: 'normal', trend: [98.6, 98.6, 98.8, 99.0, 99.2, 99.4, 99.5, 99.6, 99.5, 99.6] },
    respRate:     { value: 20,  unit: '/min',   status: 'normal', trend: [16, 17, 17, 18, 18, 19, 19, 20, 20, 20] },
    map:          { value: 106, unit: 'mmHg',   status: 'high',   trend: [92, 94, 96, 98, 100, 102, 104, 105, 106, 106] },
    etco2:        { value: 36,  unit: 'mmHg',   status: 'normal', trend: [38, 37, 37, 37, 36, 36, 36, 36, 36, 36] },
    bloodSugar:   { value: 118, unit: 'mg/dL',  status: 'normal', trend: [105, 108, 110, 112, 113, 115, 116, 117, 118, 118] },
  },
  p3: {
    heartRate:    { value: 74,  unit: 'bpm',    status: 'normal', trend: [72, 73, 72, 74, 73, 74, 73, 74, 74, 74] },
    spo2:         { value: 98,  unit: '%',      status: 'normal', trend: [98, 98, 98, 97, 98, 98, 98, 98, 98, 98] },
    bloodPressure:{ value: '124/78', systolic: 124, diastolic: 78, unit: 'mmHg', status: 'normal', trend: [120, 121, 122, 123, 124, 123, 124, 124, 124, 124] },
    temperature:  { value: 98.4, unit: '°F',    status: 'normal', trend: [98.2, 98.3, 98.3, 98.4, 98.4, 98.3, 98.4, 98.4, 98.4, 98.4] },
    respRate:     { value: 16,  unit: '/min',   status: 'normal', trend: [15, 16, 16, 15, 16, 16, 16, 16, 16, 16] },
    map:          { value: 93,  unit: 'mmHg',   status: 'normal', trend: [90, 91, 92, 92, 93, 93, 93, 93, 93, 93] },
    etco2:        { value: 38,  unit: 'mmHg',   status: 'normal', trend: [38, 38, 38, 37, 38, 38, 38, 38, 38, 38] },
    bloodSugar:   { value: 96,  unit: 'mg/dL',  status: 'normal', trend: [94, 95, 95, 96, 96, 95, 96, 96, 96, 96] },
  },
  p4: {
    heartRate:    { value: 70,  unit: 'bpm',    status: 'normal', trend: [68, 69, 70, 70, 71, 70, 70, 70, 70, 70] },
    spo2:         { value: 99,  unit: '%',      status: 'normal', trend: [99, 99, 99, 99, 99, 99, 99, 99, 99, 99] },
    bloodPressure:{ value: '118/74', systolic: 118, diastolic: 74, unit: 'mmHg', status: 'normal', trend: [116, 117, 118, 118, 118, 117, 118, 118, 118, 118] },
    temperature:  { value: 98.2, unit: '°F',    status: 'normal', trend: [98.0, 98.1, 98.1, 98.2, 98.2, 98.2, 98.2, 98.2, 98.2, 98.2] },
    respRate:     { value: 15,  unit: '/min',   status: 'normal', trend: [14, 15, 15, 15, 15, 14, 15, 15, 15, 15] },
    map:          { value: 89,  unit: 'mmHg',   status: 'normal', trend: [87, 88, 89, 89, 89, 88, 89, 89, 89, 89] },
    etco2:        { value: 39,  unit: 'mmHg',   status: 'normal', trend: [39, 39, 39, 39, 39, 39, 39, 39, 39, 39] },
    bloodSugar:   { value: 92,  unit: 'mg/dL',  status: 'normal', trend: [90, 91, 91, 92, 92, 91, 92, 92, 92, 92] },
  },
  p5: {
    heartRate:    { value: 104, unit: 'bpm',    status: 'high',   trend: [88, 90, 92, 95, 97, 100, 102, 103, 104, 104] },
    spo2:         { value: 93,  unit: '%',      status: 'low',    trend: [97, 96, 96, 95, 95, 94, 94, 93, 93, 93] },
    bloodPressure:{ value: '148/92', systolic: 148, diastolic: 92, unit: 'mmHg', status: 'high', trend: [130, 134, 136, 138, 140, 142, 144, 146, 147, 148] },
    temperature:  { value: 99.8, unit: '°F',    status: 'normal', trend: [98.8, 99.0, 99.0, 99.2, 99.4, 99.5, 99.6, 99.7, 99.8, 99.8] },
    respRate:     { value: 22,  unit: '/min',   status: 'high',   trend: [17, 18, 18, 19, 20, 20, 21, 21, 22, 22] },
    map:          { value: 111, unit: 'mmHg',   status: 'high',   trend: [97, 100, 102, 104, 106, 108, 109, 110, 111, 111] },
    etco2:        { value: 34,  unit: 'mmHg',   status: 'normal', trend: [37, 36, 36, 35, 35, 35, 34, 34, 34, 34] },
    bloodSugar:   { value: 128, unit: 'mg/dL',  status: 'normal', trend: [112, 115, 118, 120, 122, 124, 126, 127, 128, 128] },
  },
  p6: {
    heartRate:    { value: 72,  unit: 'bpm',    status: 'normal', trend: [70, 71, 71, 72, 72, 71, 72, 72, 72, 72] },
    spo2:         { value: 98,  unit: '%',      status: 'normal', trend: [98, 98, 98, 98, 98, 98, 98, 98, 98, 98] },
    bloodPressure:{ value: '120/76', systolic: 120, diastolic: 76, unit: 'mmHg', status: 'normal', trend: [118, 119, 120, 120, 120, 119, 120, 120, 120, 120] },
    temperature:  { value: 98.4, unit: '°F',    status: 'normal', trend: [98.2, 98.3, 98.3, 98.4, 98.4, 98.3, 98.4, 98.4, 98.4, 98.4] },
    respRate:     { value: 16,  unit: '/min',   status: 'normal', trend: [15, 16, 16, 16, 16, 15, 16, 16, 16, 16] },
    map:          { value: 91,  unit: 'mmHg',   status: 'normal', trend: [89, 90, 91, 91, 91, 90, 91, 91, 91, 91] },
    etco2:        { value: 38,  unit: 'mmHg',   status: 'normal', trend: [38, 38, 38, 38, 38, 38, 38, 38, 38, 38] },
    bloodSugar:   { value: 94,  unit: 'mg/dL',  status: 'normal', trend: [92, 93, 93, 94, 94, 93, 94, 94, 94, 94] },
  },
};

// Default vitals for patients not explicitly listed above
export const DEFAULT_VITALS = {
  heartRate:    { value: 72,  unit: 'bpm',    status: 'normal', trend: [70, 71, 72, 72, 71, 72, 72, 71, 72, 72] },
  spo2:         { value: 98,  unit: '%',      status: 'normal', trend: [98, 98, 98, 97, 98, 98, 98, 98, 98, 98] },
  bloodPressure:{ value: '120/78', systolic: 120, diastolic: 78, unit: 'mmHg', status: 'normal', trend: [118, 119, 120, 120, 120, 119, 120, 120, 120, 120] },
  temperature:  { value: 98.4, unit: '°F',    status: 'normal', trend: [98.2, 98.3, 98.4, 98.4, 98.3, 98.4, 98.4, 98.3, 98.4, 98.4] },
  respRate:     { value: 16,  unit: '/min',   status: 'normal', trend: [15, 16, 16, 16, 15, 16, 16, 16, 16, 16] },
  map:          { value: 91,  unit: 'mmHg',   status: 'normal', trend: [89, 90, 91, 91, 90, 91, 91, 90, 91, 91] },
  etco2:        { value: 38,  unit: 'mmHg',   status: 'normal', trend: [38, 38, 38, 38, 38, 38, 38, 38, 38, 38] },
  bloodSugar:   { value: 95,  unit: 'mg/dL',  status: 'normal', trend: [93, 94, 95, 95, 94, 95, 95, 94, 95, 95] },
};

// ── Alerts ─────────────────────────────────────────────────
export const MOCK_ALERTS = {
  p1: [
    { id: 'a1', time: '10:38 AM', parameter: 'SpO₂',           message: 'SpO₂ dropped to 91%',         status: 'active' },
    { id: 'a2', time: '10:32 AM', parameter: 'Heart Rate',     message: 'Heart rate above threshold',   status: 'active' },
    { id: 'a3', time: '10:28 AM', parameter: 'Blood Pressure', message: 'Blood pressure high',          status: 'active' },
    { id: 'a4', time: '10:15 AM', parameter: 'Temperature',    message: 'Temperature above threshold',  status: 'active' },
  ],
  p2: [
    { id: 'a5', time: '10:20 AM', parameter: 'SpO₂',           message: 'SpO₂ below 95%',              status: 'active' },
    { id: 'a6', time: '09:55 AM', parameter: 'Heart Rate',     message: 'Heart rate elevated',          status: 'active' },
    { id: 'a7', time: '09:30 AM', parameter: 'Infusion Pump',  message: 'Low battery on infusion pump', status: 'warning' },
  ],
  p5: [
    { id: 'a8', time: '10:10 AM', parameter: 'SpO₂',           message: 'SpO₂ dropped below 94%',      status: 'active' },
    { id: 'a9', time: '09:45 AM', parameter: 'Heart Rate',     message: 'Heart rate above 100 bpm',     status: 'active' },
    { id: 'a10',time: '09:20 AM', parameter: 'ECG Monitor',    message: 'ECG device offline',           status: 'resolved' },
  ],
  p9: [
    { id: 'a11',time: '10:05 AM', parameter: 'Infusion Pump',  message: 'Infusion pump disconnected',   status: 'active' },
  ],
};

// ── ECG Waveform Mock Data (PQRST pattern) ────────────────
// Generates a realistic-looking ECG PQRST complex repeated
function generateECGData() {
  // Single PQRST complex: ~50 data points
  const singleBeat = [
    // Baseline
    0, 0, 0, 0, 0, 0,
    // P wave
    0.05, 0.12, 0.18, 0.22, 0.18, 0.12, 0.05,
    // PR segment
    0, 0, 0,
    // QRS complex
    -0.08, -0.15,
    0.85, 1.0, 0.92,        // R peak
    -0.25, -0.35, -0.18,    // S wave
    // ST segment
    0, 0.02, 0.04,
    // T wave
    0.08, 0.15, 0.22, 0.28, 0.30, 0.28, 0.22, 0.15, 0.08,
    // Baseline
    0, 0, 0, 0, 0, 0, 0, 0,
  ];

  const data = [];
  for (let i = 0; i < 5; i++) {
    data.push(...singleBeat);
  }
  return data;
}

export const MOCK_ECG_DATA = generateECGData();

// ── Device Trend Data (last 1 hour, 12 points = every 5 min) ──
export const MOCK_DEVICE_TRENDS = {
  p1: {
    labels: ['10:00','10:05','10:10','10:15','10:20','10:25','10:30','10:35','10:38'],
    heartRate:   [102, 105, 108, 110, 112, 114, 115, 117, 118],
    spo2:        [95,  94,  94,  93,  93,  92,  92,  91,  91],
    bpSystolic:  [148, 150, 152, 154, 155, 157, 158, 159, 160],
    temperature: [99.8, 99.9, 100.0, 100.0, 100.1, 100.2, 100.2, 100.3, 100.4],
  },
  p2: {
    labels: ['10:00','10:05','10:10','10:15','10:20','10:25','10:30','10:35','10:38'],
    heartRate:   [85, 87, 88, 90, 91, 92, 94, 95, 96],
    spo2:        [97, 96, 96, 96, 95, 95, 95, 94, 94],
    bpSystolic:  [132, 134, 135, 136, 138, 139, 140, 141, 142],
    temperature: [99.0, 99.1, 99.2, 99.3, 99.3, 99.4, 99.5, 99.5, 99.6],
  },
};

// Default trends for patients without specific data
export const DEFAULT_DEVICE_TRENDS = {
  labels: ['10:00','10:05','10:10','10:15','10:20','10:25','10:30','10:35','10:38'],
  heartRate:   [72, 72, 73, 72, 71, 72, 72, 72, 72],
  spo2:        [98, 98, 98, 98, 98, 98, 98, 98, 98],
  bpSystolic:  [120, 120, 121, 120, 120, 119, 120, 120, 120],
  temperature: [98.4, 98.4, 98.4, 98.3, 98.4, 98.4, 98.4, 98.4, 98.4],
};

// ── Ward List ─────────────────────────────────────────────
export const WARD_OPTIONS = ['All Wards', 'ICU', 'Ward A', 'Ward B', 'Ward C'];

// ── Device type icon labels ───────────────────────────────
export const DEVICE_TYPE_LABELS = {
  ecg: 'ECG',
  ventilator: 'Ventilator',
  spo2: 'SpO₂',
  monitor: 'Monitor',
  infusion: 'Infusion',
};

export const MOCK_PLETH_DATA = [
  0.0, 0.05, 0.15, 0.35, 0.70, 0.95, 1.0, 0.88, 0.70, 0.55, 0.48, 0.52, 0.46, 0.35, 0.22, 0.12, 0.05, 0.0,
  0.0, 0.05, 0.15, 0.35, 0.70, 0.95, 1.0, 0.88, 0.70, 0.55, 0.48, 0.52, 0.46, 0.35, 0.22, 0.12, 0.05, 0.0,
  0.0, 0.05, 0.15, 0.35, 0.70, 0.95, 1.0, 0.88, 0.70, 0.55, 0.48, 0.52, 0.46, 0.35, 0.22, 0.12, 0.05, 0.0,
  0.0, 0.05, 0.15, 0.35, 0.70, 0.95, 1.0, 0.88, 0.70, 0.55, 0.48, 0.52, 0.46, 0.35, 0.22, 0.12, 0.05, 0.0,
];

// ── Mock Clinical Notes ────────────────────────────────────
export const MOCK_PATIENT_NOTES = {
  p1: [
    { id: 'n1', author: 'Dr. Vivek Sharma (Intensivist)', role: 'Doctor', time: 'Today, 10:15 AM', text: 'Patient in ICU with acute respiratory distress. High HR & BP observed. Vent FiO2 adjusted to 55%. Continuous ECG & arterial line monitoring active.' },
    { id: 'n2', author: 'Nurse Priya George (ICU In-charge)', role: 'Nurse', time: 'Today, 09:30 AM', text: 'Administered IV Furosemide 20mg as per physician order. Urine output 45ml/hr. Vitals recorded.' },
  ],
  p2: [
    { id: 'n1', author: 'Dr. Anita Desai (Cardiologist)', role: 'Doctor', time: 'Today, 09:00 AM', text: 'Post-op observation Day 2. Mild tachycardia noticed during rounds. Monitor potassium and magnesium levels.' },
    { id: 'n2', author: 'Nurse Reema Sen', role: 'Nurse', time: 'Today, 08:15 AM', text: 'Morning infusion completed. Patient resting comfortably. IV site clean with no redness.' },
  ],
};

// ── Mock Telemetry History ─────────────────────────────────
export const MOCK_TELEMETRY_HISTORY = {
  p1: [
    { time: '10:35 AM', hr: '118 bpm', spo2: '91%', bp: '160/98', temp: '100.4 °F', rr: '28 /min', status: 'critical' },
    { time: '10:20 AM', hr: '114 bpm', spo2: '92%', bp: '157/96', temp: '100.2 °F', rr: '26 /min', status: 'critical' },
    { time: '10:05 AM', hr: '108 bpm', spo2: '94%', bp: '152/94', temp: '100.0 °F', rr: '25 /min', status: 'attention' },
    { time: '09:50 AM', hr: '102 bpm', spo2: '95%', bp: '148/90', temp: '99.8 °F',  rr: '24 /min', status: 'attention' },
    { time: '09:30 AM', hr: '98 bpm',  spo2: '96%', bp: '142/88', temp: '99.5 °F',  rr: '22 /min', status: 'stable' },
  ],
};

// ── Summary counts (derived from mock data) ───────────────
export const getMonitoringSummary = (patients) => {
  const total = patients.length;
  const stable = patients.filter(p => p.status === 'stable').length;
  const attention = patients.filter(p => p.status === 'attention').length;
  const critical = patients.filter(p => p.status === 'critical').length;
  const devicesOnline = MOCK_DEVICES.filter(d => d.status === 'online').length;
  const devicesTotal = MOCK_DEVICES.length;
  return { total, stable, attention, critical, devicesOnline, devicesTotal };
};
