import axios from 'axios';

// Base URL from Environment (Vercel / Local)
const baseURL = import.meta.env.VITE_API_URL || 'https://hms-h939.onrender.com';

const apiClient = axios.create({
    baseURL: baseURL,
    headers: { 'Content-Type': 'application/json' },
});

// Request Interceptor
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) config.headers.Authorization = `Bearer ${token}`;
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
    getPatientHistory: async (patientId) => {
        const response = await apiClient.get(`/api/doctor/patients/${patientId}/history`);
        return response.data;
    },
    getFullPatientProfile: async (patientId) => {
        const response = await apiClient.get(`/api/doctor/patients/${patientId}/full-profile`);
        return response.data;
    },
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
    getAllAppointments: async () => {
        const response = await apiClient.get('/api/reception/appointments');
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
    confirmPayment: async (id, paymentMethod, amount) => {
        const response = await apiClient.patch(`/api/reception/appointments/${id}/confirm-payment`, { paymentMethod, amount });
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
    getUsers: async () => (await apiClient.get('/api/admin/users')).data,
    createUser: async (data) => (await apiClient.post('/api/admin/users', data)).data,
    deleteUser: async (id) => (await apiClient.delete(`/api/admin/users/${id}`)).data,
    updateUser: async (id, data) => (await apiClient.put(`/api/admin/users/${id}`, data)).data,
    getRoles: async () => (await apiClient.get('/api/admin/roles')).data,
    createRole: async (data) => (await apiClient.post('/api/admin/roles', data)).data,
    updateRole: async (id, data) => (await apiClient.put(`/api/admin/roles/${id}`, data)).data,
    deleteRole: async (id) => (await apiClient.delete(`/api/admin/roles/${id}`)).data,
};

export const adminEntitiesAPI = {
    getDoctors: async () => (await apiClient.get('/api/admin-entities/doctors')).data,
    createDoctor: async (data) => (await apiClient.post('/api/admin-entities/doctors', data)).data,
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
    getDoctors: async (serviceId = null) => {
        const url = serviceId ? `/api/doctor?serviceId=${serviceId}` : '/api/doctor';
        return (await apiClient.get(url)).data;
    },
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
    getFullHistory: async (id) => (await apiClient.get(`/api/patients/${id}/full-history`)).data
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
    getHospitals: async () => (await apiClient.get('/api/hospitals')).data,
    createHospital: async (data) => (await apiClient.post('/api/hospitals', data)).data,
    updateHospital: async (id, data) => (await apiClient.put(`/api/hospitals/${id}`, data)).data,
    deleteHospital: async (id) => (await apiClient.delete(`/api/hospitals/${id}`)).data,
    getMyHospital: async () => (await apiClient.get('/api/hospitals/my-hospital')).data,
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
    getPatientBills: async (identifier) => (await apiClient.get(`/api/billing/patient/${identifier}`)).data,
    addFacilityCharge: async (data) => (await apiClient.post('/api/billing/facility-charge', data)).data,
    processPayment: async (data) => (await apiClient.put('/api/billing/pay', data)).data,
};

export const admissionAPI = {
    createAdmission: async (data) => (await apiClient.post('/api/admissions', data)).data,
    getActiveAdmissions: async () => (await apiClient.get('/api/admissions/active')).data,
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
    bookAppointment: async (data) => (await apiClient.post('/api/clinic/appointments', data)).data,
    completeAppointment: async (id, data) => (await apiClient.put(`/api/clinic/appointments/${id}/complete`, data)).data,
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
    cancelTreatmentPlan: async (id) => (await apiClient.put(`/api/clinic/treatment-plans/${id}/cancel`, {})).data,
};

export const simpleClinicAPI = {
    getClinics: async () => (await apiClient.get('/api/simple-clinics')).data,
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

export default apiClient;
