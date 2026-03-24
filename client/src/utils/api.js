import axios from 'axios';

// Base URL from Environment (Vercel / Local)
const baseURL = import.meta.env.VITE_API_URL || 'https://crm-222i.onrender.com';

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
    getBookedSlots: async (doctorId, date) => {
        const response = await apiClient.get(`/api/doctor/${doctorId}/booked-slots?date=${date}`);
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
    completeOrder: async (id) => (await apiClient.patch(`/api/pharmacy/orders/${id}/complete`)).data
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
    getLabTests: async () => (await apiClient.get('/api/lab-tests')).data,
    createLabTest: async (data) => (await apiClient.post('/api/lab-tests', data)).data,
    updateLabTest: async (id, data) => (await apiClient.put(`/api/lab-tests/${id}`, data)).data,
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

export default apiClient;
