import axios from 'axios';

// Base URL from Environment (Vercel / Local)
const baseURL = import.meta.env.DEV ? 'http://localhost:3000' : (import.meta.env.VITE_API_URL || 'https://hms-h939.onrender.com');

const apiClient = axios.create({
    baseURL: baseURL,
    headers: { 'Content-Type': 'application/json' },
});

// Request Interceptor
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        const patientToken = localStorage.getItem('patientToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        } else if (patientToken) {
            config.headers.Authorization = `Bearer ${patientToken}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response Interceptor
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // CIRCULAR DEPENDENCY FIX:
            // Instead of dispatching logout action here, we simply clear storage and redirect.
            // The authSlice will pick up the initial state from localStorage on reload.
            localStorage.removeItem('token');
            localStorage.removeItem('user');

            // Only redirect if not already on the login page to avoid loops
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export const authAPI = {
    login: async (email, password, hospitalId) => {
        const payload = { email, password };
        if (hospitalId) payload.hospitalId = hospitalId;
        const response = await apiClient.post('/api/auth/login', payload);
        return response.data;
    },
    signup: async (name, email, password, phone = '') => {
        const response = await apiClient.post('/api/auth/signup', { name, email, password, phone });
        return response.data;
    },
};

export const doctorAPI = {
    getAppointments: async () => {
        const response = await apiClient.get('/api/doctor/appointments');
        return response.data;
    },
    getAllAppointments: async () => {
        const response = await apiClient.get('/api/doctor/all-appointments');
        return response.data;
    },
    getAppointmentDetails: async (id) => {
        const response = await apiClient.get(`/api/doctor/appointments/${id}`);
        return response.data;
    },
    getPatients: async () => {
        const response = await apiClient.get('/api/doctor/patients');
        return response.data;
    },
    getPatientHistory: async (patientId, department) => {
        let url = `/api/doctor/patients/${patientId}/history`;
        if (department) url += `?department=${encodeURIComponent(department)}`;
        const response = await apiClient.get(url);
        return response.data;
    },
    getFullPatientProfile: async (patientId) => {
        const response = await apiClient.get(`/api/doctor/patients/${patientId}/full-profile`);
        return response.data;
    },
    getClinicPatientReports: async (clinicPatientId) => (await apiClient.get(`/api/doctor/clinic-patients/${clinicPatientId}/reports`)).data,
    startSession: async (patientId) => {
        const response = await apiClient.post('/api/doctor/session/start', { patientId });
        return response.data;
    },
    updatePatientProfile: async (patientId, profileData) => {
        const response = await apiClient.put(`/api/doctor/patients/${patientId}/profile`, profileData);
        return response.data;
    },
    updateSession: async (id, data) => {
        const formData = new FormData();
        Object.keys(data).forEach(key => {
            if (typeof data[key] === 'object' && key !== 'prescriptionFile') {
                formData.append(key, JSON.stringify(data[key]));
            } else {
                formData.append(key, data[key]);
            }
        });
        const response = await apiClient.patch(`/api/doctor/appointments/${id}/prescription`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
    getLabs: async () => {
        const response = await apiClient.get('/api/doctor/labs-list');
        return response.data;
    },
    getMedicines: async () => {
        const response = await apiClient.get('/api/doctor/medicines-list');
        return response.data;
    },
    getBookedSlots: async (doctorId, date) => {
        const response = await apiClient.get(`/api/doctor/${doctorId}/booked-slots?date=${date}`);
        return response.data;
    }
};

export const receptionAPI = {
    getAllAppointments: async (params = {}) => {
        const response = await apiClient.get('/api/reception/appointments', { params });
        return response.data;
    },
    getAllPatients: async () => {
        const response = await apiClient.get('/api/reception/patients');
        return response.data;
    },
    registerPatient: async (data) => {
        const response = await apiClient.post('/api/reception/register', data);
        return response.data;
    },
    getTransactions: async () => {
        const response = await apiClient.get('/api/reception/transactions');
        return response.data;
    },
    searchPatients: async (query) => {
        const response = await apiClient.get(`/api/reception/search-patients?query=${query}`);
        return response.data;
    },
    updateIntake: async (userId, data) => {
        const response = await apiClient.put(`/api/reception/intake/${userId}`, data);
        return response.data;
    },
    getFollowupStatus: async (patientId, department, date = '') => {
        let url = department === 'auto'
            ? `/api/reception/patients/${patientId}/followup-status?auto=true`
            : department
                ? `/api/reception/patients/${patientId}/followup-status?department=${encodeURIComponent(department)}`
                : `/api/reception/patients/${patientId}/followup-status`;
        if (date) {
            url += (url.includes('?') ? '&' : '?') + `date=${date}`;
        }
        const response = await apiClient.get(url);
        return response.data;
    },
    bookAppointment: async (data) => {
        const response = await apiClient.post('/api/reception/book-appointment', data);
        return response.data;
    },
    getBookedSlots: async (doctorId, date, hospitalId = '') => {
        let url = `/api/doctor/${doctorId}/booked-slots?date=${date}`;
        if (hospitalId) url += `&hospitalId=${hospitalId}`;
        const response = await apiClient.get(url);
        return response.data;
    },
    rescheduleAppointment: async (id, date, time) => {
        const response = await apiClient.patch(`/api/reception/appointments/${id}/reschedule`, { date, time });
        return response.data;
    },
    cancelAppointment: async (id) => {
        const response = await apiClient.patch(`/api/reception/appointments/${id}/cancel`);
        return response.data;
    },
    confirmPayment: async (id, paymentMethod, amount, data = {}) => {
        const response = await apiClient.patch(`/api/reception/appointments/${id}/confirm-payment`, { paymentMethod, amount, ...data });
        return response.data;
    },
    sendAadhaarOTP: async (aadhaarNumber) => {
        const response = await apiClient.post('/api/reception/send-aadhaar-otp', { aadhaarNumber });
        return response.data;
    },
    verifyAadhaarOTP: async (aadhaarNumber, otp) => {
        const response = await apiClient.post('/api/reception/verify-aadhaar-otp', { aadhaarNumber, otp });
        return response.data;
    }
};

export const adminAPI = {
    login: async (email, password) => (await apiClient.post('/api/admin/login', { email, password })).data,
    signup: async (name, email, password, phone) => (await apiClient.post('/api/admin/signup', { name, email, password, phone })).data,
    getUsers: async (plan, hospitalId) => {
        let url = '/api/admin/users?';
        if (plan) url += `plan=${encodeURIComponent(plan)}&`;
        if (hospitalId) url += `hospitalId=${encodeURIComponent(hospitalId)}&`;
        return (await apiClient.get(url)).data;
    },
    createUser: async (data) => (await apiClient.post('/api/admin/users', data)).data,
    deleteUser: async (id) => (await apiClient.delete(`/api/admin/users/${id}`)).data,
    updateUser: async (id, data) => (await apiClient.put(`/api/admin/users/${id}`, data)).data,
    getRoles: async (plan) => {
        let url = '/api/admin/roles';
        if (plan) url += `?plan=${encodeURIComponent(plan)}`;
        return (await apiClient.get(url)).data;
    },
    createRole: async (data) => (await apiClient.post('/api/admin/roles', data)).data,
    updateRole: async (id, data) => (await apiClient.put(`/api/admin/roles/${id}`, data)).data,
    deleteRole: async (id) => (await apiClient.delete(`/api/admin/roles/${id}`)).data,
};

export const adminEntitiesAPI = {
    getDoctors: async () => (await apiClient.get('/api/admin-entities/doctors')).data,
    getDoctor: async (id) => (await apiClient.get(`/api/admin-entities/doctors/${id}`)).data,
    createDoctor: async (data) => (await apiClient.post('/api/admin-entities/doctors', data)).data,
    updateDoctor: async (id, data) => (await apiClient.put(`/api/admin-entities/doctors/${id}`, data)).data,
    deleteDoctor: async (id) => (await apiClient.delete(`/api/admin-entities/doctors/${id}`)).data,
    getLabs: async () => (await apiClient.get('/api/admin-entities/labs')).data,
    createLab: async (data) => (await apiClient.post('/api/admin-entities/labs', data)).data,
    deleteLab: async (id) => (await apiClient.delete(`/api/admin-entities/labs/${id}`)).data,
    getPharmacies: async () => (await apiClient.get('/api/admin-entities/pharmacies')).data,
    createPharmacy: async (data) => (await apiClient.post('/api/admin-entities/pharmacies', data)).data,
    deletePharmacy: async (id) => (await apiClient.delete(`/api/admin-entities/pharmacies/${id}`)).data,
    getReceptions: async () => (await apiClient.get('/api/admin-entities/receptions')).data,
    createReception: async (data) => (await apiClient.post('/api/admin-entities/receptions', data)).data,
    deleteReception: async (id) => (await apiClient.delete(`/api/admin-entities/receptions/${id}`)).data,
    getServices: async () => (await apiClient.get('/api/admin-entities/services')).data,
    createService: async (data) => (await apiClient.post('/api/admin-entities/services', data)).data,
    deleteService: async (id) => (await apiClient.delete(`/api/admin-entities/services/${id}`)).data,
};

export const publicAPI = {
    getServices: async () => (await apiClient.get('/api/public/services')).data,
    getDoctors: async (serviceId = null, hospitalId = null) => {
        let url = '/api/doctor';
        const params = [];
        if (serviceId) params.push(`serviceId=${encodeURIComponent(serviceId)}`);
        if (hospitalId) params.push(`hospitalId=${encodeURIComponent(hospitalId)}`);
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        return (await apiClient.get(url)).data;
    },
    getTenantConfig: async (domain) => {
        const url = `/api/public/tenant-config?domain=${encodeURIComponent(domain)}`;
        return (await apiClient.get(url)).data;
    }
};

export const reportAPI = {
    uploadReport: async (formData) => {
        const response = await apiClient.post('/api/reports/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
    getReportsByAppointment: async (appointmentId) => {
        const response = await apiClient.get(`/api/reports/${appointmentId}`);
        return response.data;
    }
};

export const uploadAPI = {
    uploadImages: async (formData) => {
        const response = await apiClient.post('/api/upload/images', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
};

export const labAPI = {
    getStats: async () => (await apiClient.get('/api/lab/stats')).data,
    getMyReports: async () => (await apiClient.get('/api/lab/my-reports')).data,
    getRequests: async (status) => (await apiClient.get(`/api/lab/requests?status=${status || ''}`)).data,
    updatePayment: async (id, paymentData) => (await apiClient.patch(`/api/lab/update-payment/${id}`, paymentData)).data,
    uploadReport: async (id, formData) => (await apiClient.post(`/api/lab/upload-report/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })).data
};

export const pharmacyAPI = {
    getInventory: async () => (await apiClient.get('/api/pharmacy/inventory')).data,
    addMedicine: async (data) => (await apiClient.post('/api/pharmacy/inventory', data)).data,
    updateMedicine: async (id, data) => (await apiClient.put(`/api/pharmacy/inventory/${id}`, data)).data,
    deleteMedicine: async (id) => (await apiClient.delete(`/api/pharmacy/inventory/${id}`)).data
};

export const pharmacyOrderAPI = {
    getOrders: async () => (await apiClient.get('/api/pharmacy/orders')).data,
    completeOrder: async (id, purchasedIndices = null) => (await apiClient.patch(`/api/pharmacy/orders/${id}/complete`, { purchasedIndices })).data
};

export const clinicalAPI = {
    intake: async (data) => (await apiClient.post('/api/clinical/intake', data)).data,
    getHistory: async (patientId) => (await apiClient.get(`/api/clinical/history/${patientId}`)).data,
    diagnose: async (visitId, data) => (await apiClient.post(`/api/clinical/diagnose/${visitId}`, data)).data
};

export const patientAPI = {
    search: async (term) => (await apiClient.get(`/api/patients/search?term=${term}`)).data,
    getFullHistory: async (id, department) => {
        let url = `/api/patients/${id}/full-history`;
        const params = new URLSearchParams();
        if (department) params.append('department', department);
        if (params.toString()) url += `?${params.toString()}`;
        return (await apiClient.get(url)).data;
    },
    uploadConsent: async (id, formData) => (await apiClient.post(`/api/patients/${id}/consent`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data,
    getConsent: async (id) => (await apiClient.get(`/api/patients/${id}/consent`)).data,
    deleteConsent: async (id, index, fileId) => (await apiClient.delete(`/api/patients/${id}/consent/${index}`, { data: { fileId } })).data,
    uploadDocument: async (id, formData) => (await apiClient.post(`/api/patients/${id}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data,
    getDocuments: async (id, department) => {
        let url = `/api/patients/${id}/documents`;
        const params = new URLSearchParams();
        if (department) params.append('department', department);
        if (params.toString()) url += `?${params.toString()}`;
        return (await apiClient.get(url)).data;
    },
    deleteDocument: async (id, index, fileId, url, fileName) => (await apiClient.delete(`/api/patients/${id}/documents/${index}`, { data: { fileId, url, fileName } })).data,
    updateProfile: async (id, data) => (await apiClient.put(`/api/reception/intake/${id}`, data)).data
};

export const notificationAPI = {
    getNotifications: async () => (await apiClient.get('/api/notifications')).data,
    markAsRead: async (id) => (await apiClient.patch(`/api/notifications/${id}/read`)).data,
    markAllAsRead: async () => (await apiClient.patch('/api/notifications/read-all')).data
};

export const labTestAPI = {
    getLabTests: async (hospitalId = '') => {
        const url = hospitalId ? `/api/lab-tests?hospitalId=${hospitalId}` : '/api/lab-tests';
        return (await apiClient.get(url)).data;
    },
    createLabTest: async (data) => (await apiClient.post('/api/lab-tests', data)).data,
    updateLabTest: async (id, data) => (await apiClient.put(`/api/lab-tests/${id}`, data)).data,
    setHospitalPrice: async (id, hospitalId, price) => (await apiClient.put(`/api/lab-tests/${id}/hospital-price`, { hospitalId, price })).data,
    deleteLabTest: async (id) => (await apiClient.delete(`/api/lab-tests/${id}`)).data
};

export const medicineAPI = {
    getMedicines: async () => (await apiClient.get('/api/medicines')).data,
    createMedicine: async (data) => (await apiClient.post('/api/medicines', data)).data,
    updateMedicine: async (id, data) => (await apiClient.put(`/api/medicines/${id}`, data)).data,
    deleteMedicine: async (id) => (await apiClient.delete(`/api/medicines/${id}`)).data
};

export const questionLibraryAPI = {
    getLibrary: async () => (await apiClient.get('/api/question-library')).data,
    updateLibrary: async (data) => (await apiClient.post('/api/question-library', { data })).data
};

export const testPackageAPI = {
    getPackages: async () => (await apiClient.get('/api/test-packages')).data,
    getPackage: async (id) => (await apiClient.get(`/api/test-packages/${id}`)).data,
    createPackage: async (data) => (await apiClient.post('/api/test-packages', data)).data,
    updatePackage: async (id, data) => (await apiClient.put(`/api/test-packages/${id}`, data)).data,
    deletePackage: async (id) => (await apiClient.delete(`/api/test-packages/${id}`)).data,
};

export const hospitalAPI = {
    resolveHospital: async (slug) => (await apiClient.get(`/api/hospitals/resolve/${slug}`)).data,
    getHospitals: async (plan) => {
        let url = '/api/hospitals';
        if (plan) url += `?plan=${encodeURIComponent(plan)}`;
        return (await apiClient.get(url)).data;
    },
    createHospital: async (data) => (await apiClient.post('/api/hospitals', data)).data,
    updateHospital: async (id, data) => (await apiClient.put(`/api/hospitals/${id}`, data)).data,
    deleteHospital: async (id) => (await apiClient.delete(`/api/hospitals/${id}`)).data,
    getMyHospital: async () => (await apiClient.get('/api/hospitals/my-hospital')).data,
    // UPI management (Hospital Admin) — legacy
    getUpiIds: async () => (await apiClient.get('/api/hospitals/my-hospital/upi-ids')).data,
    updateUpiIds: async (upiIds) => (await apiClient.put('/api/hospitals/my-hospital/upi-ids', { upiIds })).data,
    // Department-wise UPI management (Hospital Admin)
    getDepartmentUpis: async () => (await apiClient.get('/api/hospitals/my-hospital/department-upi')).data,
    createDepartmentUpi: async (data) => (await apiClient.post('/api/hospitals/my-hospital/department-upi', data)).data,
    updateDepartmentUpi: async (id, data) => (await apiClient.put(`/api/hospitals/my-hospital/department-upi/${id}`, data)).data,
    deleteDepartmentUpi: async (id) => (await apiClient.delete(`/api/hospitals/my-hospital/department-upi/${id}`)).data,
    getStaffForUpi: async () => (await apiClient.get('/api/hospitals/my-hospital/staff-for-upi')).data,
    getDepartmentUpiByRole: async (roleName) => (await apiClient.get(`/api/hospitals/my-hospital/department-upi/by-role/${encodeURIComponent(roleName)}`)).data,
    updateFacilities: async (data) => (await apiClient.put('/api/hospitals/my-hospital/facilities', data)).data,
    updateDepartmentFees: async (data) => (await apiClient.put('/api/hospitals/my-hospital/department-fees', data)).data,
    // Hospital inventory
    getInventory: async () => (await apiClient.get('/api/hospitals/my-hospital/inventory')).data,
    addInventory: async (data) => (await apiClient.post('/api/hospitals/my-hospital/inventory', data)).data,
    updateInventory: async (id, data) => (await apiClient.put(`/api/hospitals/my-hospital/inventory/${id}`, data)).data,
    deleteInventory: async (id) => (await apiClient.delete(`/api/hospitals/my-hospital/inventory/${id}`)).data,
    // Hospital lab test pricing
    getHospitalLabTests: async () => (await apiClient.get('/api/hospitals/my-hospital/lab-tests')).data,
    setLabTestPrice: async (testId, price) => (await apiClient.put(`/api/hospitals/my-hospital/lab-tests/${testId}/price`, { price })).data,
    // Hospital-specific lab tests (create/delete)
    createLabTest: async (data) => (await apiClient.post('/api/lab-tests', data)).data,
    deleteLabTest: async (id) => (await apiClient.delete(`/api/lab-tests/${id}`)).data,
    getHospitalStats: async (id, startDate, endDate) => {
        let url = `/api/hospitals/${id}/stats`;
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        return (await apiClient.get(url)).data;
    },
    // White-label branding
    getBranding: async (id) => (await apiClient.get(`/api/hospitals/${id}/branding`)).data,
    updateBranding: async (id, data) => (await apiClient.put(`/api/hospitals/${id}/branding`, data)).data,
    // Appointment mode (Supreme Admin)
    updateAppointmentMode: async (id, appointmentMode) => (await apiClient.put(`/api/hospitals/${id}`, { appointmentMode })).data,
    getNextToken: async (hospitalId, doctorId, date) => (await apiClient.get(`/api/hospitals/${hospitalId}/next-token?doctorId=${doctorId}&date=${date}`)).data,
};

export const hospitalAdminAPI = {
    login: async (email, password) => (await apiClient.post('/api/hospitals/admin/login', { email, password })).data,
    createHospitalAdmin: async (data) => (await apiClient.post('/api/hospitals/admin/signup', data)).data,
};

export const financeAPI = {
    getDashboardStats: async (startDate, endDate) => {
        let url = `/api/finance/dashboard`;
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        return (await apiClient.get(url)).data;
    }
};

export const billingAPI = {
    getPatients: async () => (await apiClient.get('/api/billing/patients')).data,
    getPatientBills: async (identifier) => (await apiClient.get(`/api/billing/patient/${identifier}`)).data,
    addFacilityCharge: async (data) => (await apiClient.post('/api/billing/facility-charge', data)).data,
    processPayment: async (data) => (await apiClient.put('/api/billing/pay', data)).data,
};



export const admissionAPI = {
    createAdmission: async (data) => (await apiClient.post('/api/admissions', data)).data,
    getActiveAdmissions: async (params = {}) => (await apiClient.get('/api/admissions/active', { params })).data,
    getPatientAdmissions: async (patientId) => (await apiClient.get(`/api/admissions/patient/${patientId}`)).data,
    dischargePatient: async (id, data = {}) => (await apiClient.put(`/api/admissions/${id}/discharge`, data)).data,
    markAdmissionPaid: async (id) => (await apiClient.put(`/api/admissions/${id}/pay`, {})).data,
};

// Clinic self-service API (for clinic admin dashboard)
export const clinicAPI = {
    getStats: async () => (await apiClient.get('/api/clinic/stats')).data,
    // Patients — uses ClinicPatient model (separate from staff)
    getPatients: async (search = '') => (await apiClient.get(`/api/clinic/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`)).data,
    registerPatient: async (data) => (await apiClient.post('/api/clinic/patients', data)).data,
    updatePatient: async (id, data) => (await apiClient.put(`/api/clinic/patients/${id}`, data)).data,
    getPatientHistory: async (patientId) => (await apiClient.get(`/api/clinic/patients/${patientId}/history`)).data,
    checkFeeWaiver: async (patientId, date) => (await apiClient.get(`/api/clinic/patients/${patientId}/check-fee-waiver${date ? `?date=${date}` : ''}`)).data,
    uploadPatientReport: async (patientId, file, name) => {
        const fd = new FormData();
        fd.append('report', file);
        if (name) fd.append('name', name);
        return (await apiClient.post(`/api/clinic/patients/${patientId}/reports`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
    },
    deletePatientReport: async (patientId, reportId) => (await apiClient.delete(`/api/clinic/patients/${patientId}/reports/${reportId}`)).data,
    // Appointments — patientId is ClinicPatient._id
    getAppointments: async (date = '', status = '') => {
        const params = new URLSearchParams();
        if (date) params.append('date', date);
        if (status) params.append('status', status);
        const qs = params.toString();
        return (await apiClient.get(`/api/clinic/appointments${qs ? '?' + qs : ''}`)).data;
    },
    getConfig: async () => (await apiClient.get('/api/clinic/config')).data,
    updateConfig: async (data) => (await apiClient.put('/api/clinic/config', data)).data,
    getStaff: async () => (await apiClient.get('/api/clinic/staff')).data,
    bookAppointment: async (data) => (await apiClient.post('/api/clinic/appointments', data)).data,
    completeAppointment: async (id, data) => (await apiClient.put(`/api/clinic/appointments/${id}/complete`, data)).data,
    updateConsultation: async (id, data) => (await apiClient.put(`/api/clinic/appointments/${id}/update-consultation`, data)).data,
    payAppointment: async (id, paymentMethod = 'Cash') => (await apiClient.put(`/api/clinic/appointments/${id}/pay`, { paymentMethod })).data,
    cancelAppointment: async (id) => (await apiClient.put(`/api/clinic/appointments/${id}/cancel`, {})).data,
    // Inventory
    getInventory: async () => (await apiClient.get('/api/clinic/inventory')).data,
    addInventory: async (data) => (await apiClient.post('/api/clinic/inventory', data)).data,
    // Pharmacy orders
    getPharmacyOrders: async () => (await apiClient.get('/api/clinic/pharmacy-orders')).data,
    dispenseOrder: async (id) => (await apiClient.put(`/api/clinic/pharmacy-orders/${id}/dispense`, {})).data,
    // Treatment Plans
    getTreatmentPlans: async () => (await apiClient.get('/api/clinic/treatment-plans')).data,
    createTreatmentPlan: async (data) => (await apiClient.post('/api/clinic/treatment-plans', data)).data,
    getTreatmentPlan: async (id) => (await apiClient.get(`/api/clinic/treatment-plans/${id}`)).data,
    getTodayDuePlans: async () => (await apiClient.get('/api/clinic/treatment-plans/today-due')).data,
    payVisit: async (planId, visitId, data) => (await apiClient.put(`/api/clinic/treatment-plans/${planId}/visits/${visitId}/pay`, data)).data,
    completeVisit: async (planId, visitId, data) => (await apiClient.put(`/api/clinic/treatment-plans/${planId}/visits/${visitId}/complete`, data)).data,
    missVisit: async (planId, visitId) => (await apiClient.put(`/api/clinic/treatment-plans/${planId}/visits/${visitId}/miss`, {})).data,
    rescheduleVisit: async (planId, visitId, data) => (await apiClient.put(`/api/clinic/treatment-plans/${planId}/visits/${visitId}/reschedule`, data)).data,
    cancelTreatmentPlan: async (id) => (await apiClient.put(`/api/clinic/treatment-plans/${id}/cancel`, {})).data,
};

export const simpleClinicAPI = {
    getClinics: async (plan) => {
        let url = '/api/simple-clinics';
        if (plan) url += `?plan=${encodeURIComponent(plan)}`;
        return (await apiClient.get(url)).data;
    },
    createClinic: async (data) => (await apiClient.post('/api/simple-clinics', data)).data,
    updateClinic: async (id, data) => (await apiClient.put(`/api/simple-clinics/${id}`, data)).data,
    deleteClinic: async (id) => (await apiClient.delete(`/api/simple-clinics/${id}`)).data,
    getStats: async (id, startDate, endDate) => {
        let url = `/api/simple-clinics/${id}/stats`;
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        return (await apiClient.get(url)).data;
    },
    createManager: async (id, data) => (await apiClient.post(`/api/simple-clinics/${id}/manager`, data)).data,
    getStaff: async (id) => (await apiClient.get(`/api/simple-clinics/${id}/staff`)).data,
    createStaff: async (id, data) => (await apiClient.post(`/api/simple-clinics/${id}/staff`, data)).data,
    deleteStaff: async (clinicId, userId) => (await apiClient.delete(`/api/simple-clinics/${clinicId}/staff/${userId}`)).data,
    // Tier management
    updateTier: async (id, data) => (await apiClient.put(`/api/simple-clinics/${id}`, data)).data,
    // Subscription / billing
    getSubscriptions: async (id) => (await apiClient.get(`/api/simple-clinics/${id}/subscriptions`)).data,
    setRate: async (id, data) => (await apiClient.put(`/api/simple-clinics/${id}/subscriptions/rate`, data)).data,
    updateSubscription: async (clinicId, subId, data) => (await apiClient.put(`/api/simple-clinics/${clinicId}/subscriptions/${subId}`, data)).data,
    // Appointment mode (Central Admin only)
    updateAppointmentMode: async (id, appointmentMode) =>
        (await apiClient.put(`/api/simple-clinics/${id}`, { appointmentMode })).data,
};

export const revenueAPI = {
    // Full system revenue analytics (monthly, quarterly, by model)
    getSystemAnalytics: async () => (await apiClient.get('/api/revenue/system')).data,
    // All hospitals with revenue config (lightweight)
    getHospitalsRevenue: async () => (await apiClient.get('/api/revenue/hospitals')).data,
    // Set or update revenue model for a hospital/clinic
    setHospitalPlan: async (id, data) => (await apiClient.put(`/api/revenue/hospital/${id}`, data)).data,
};

// Patient Auth Client (Keeps Patient Auth Separate from Staff Auth)
const patientApiClient = axios.create({
    baseURL: baseURL,
    headers: { 'Content-Type': 'application/json' },
});

patientApiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('patientToken');
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
    },
    (error) => Promise.reject(error)
);

patientApiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('patientToken');
            localStorage.removeItem('patientUser');
            if (!window.location.pathname.includes('/patient')) {
                window.location.href = '/patient';
            }
        }
        return Promise.reject(error);
    }
);

export const patientAuthAPI = {
    register: async (name, email, mobile, password, hospitalId, age, aadhaarNumber) => {
        const response = await patientApiClient.post('/api/patient-auth/register', { name, email, mobile, password, hospitalId, age, aadhaarNumber });
        return response.data;
    },
    login: async (loginId, password, hospitalId) => {
        const response = await patientApiClient.post('/api/patient-auth/login', { loginId, password, hospitalId });
        return response.data;
    },
    forgotPassword: async (email, hospitalId) => {
        const response = await patientApiClient.post('/api/patient-auth/forgot-password', { email, hospitalId });
        return response.data;
    },
    resetPassword: async (token, password) => {
        const response = await patientApiClient.post('/api/patient-auth/reset-password', { token, password });
        return response.data;
    },
    getMe: async () => (await patientApiClient.get('/api/patient-auth/me')).data,
    getPatientAppointments: async () => (await patientApiClient.get('/api/patient-auth/appointments')).data,
    getPatientProfile: async () => (await patientApiClient.get('/api/patient-auth/profile')).data,
    updatePatientProfile: async (data) => (await patientApiClient.put('/api/patient-auth/profile', data)).data,
    cancelAppointment: async (id) => (await patientApiClient.put(`/api/patient-auth/appointments/${id}/cancel`)).data,
    getPatientDocuments: async () => (await patientApiClient.get('/api/patient-auth/documents')).data,
    getPatientBills: async () => (await patientApiClient.get('/api/patient-auth/bills')).data,
    payPatientBills: async (data) => (await patientApiClient.post('/api/patient-auth/bills/pay', data)).data,
    getFollowupStatus: async (department, date = '') => {
        let url = department === 'auto'
            ? `/api/patient-auth/followup-status?auto=true`
            : department
                ? `/api/patient-auth/followup-status?department=${encodeURIComponent(department)}`
                : `/api/patient-auth/followup-status`;
        if (date) {
            url += (url.includes('?') ? '&' : '?') + `date=${date}`;
        }
        const response = await patientApiClient.get(url);
        return response.data;
    },
    bookAppointment: async (data) => (await patientApiClient.post('/api/patient-auth/book-appointment', data)).data,
    getDepartmentUpiByRole: async (roleName) => (await patientApiClient.get(`/api/patient-auth/department-upi/${encodeURIComponent(roleName)}`)).data,
};

export default apiClient;
