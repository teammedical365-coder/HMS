// client/src/utils/api.js
import axios from 'axios';

// Create axios instance with base URL from environment variable
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token if available
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error); 
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      try {
        const { getStoreRef } = require('../store/storeRef');
        const store = getStoreRef();
        if (store) {
          const { logout } = require('../store/slices/authSlice');
          store.dispatch(logout());
        }
      } catch (err) {}
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: async (email, password) => {
    const response = await apiClient.post('/api/auth/login', { email, password });
    return response.data;
  },
  signup: async (name, email, password, phone = '') => {
    const response = await apiClient.post('/api/auth/signup', { name, email, password, phone });
    return response.data;
  },
};

export const adminAPI = {
  login: async (email, password) => {
    const response = await apiClient.post('/api/admin/login', { email, password });
    return response.data;
  },
  signup: async (name, email, password, phone = '') => {
    const response = await apiClient.post('/api/admin/signup', { name, email, password, phone });
    return response.data;
  },
  createUser: async (name, email, password, phone = '', role, services = []) => {
    const response = await apiClient.post('/api/admin/users', { name, email, password, phone, role, services });
    return response.data;
  },
  getUsers: async () => {
    const response = await apiClient.get('/api/admin/users');
    return response.data;
  },
  updateUserRole: async (userId, role) => {
    const response = await apiClient.put(`/api/admin/users/${userId}/role`, { role });
    return response.data;
  },
  deleteUser: async (userId) => {
    const response = await apiClient.delete(`/api/admin/users/${userId}`);
    return response.data;
  },
};

export const adminEntitiesAPI = {
  getDoctors: async () => {
    const response = await apiClient.get('/api/admin-entities/doctors');
    return response.data;
  },
  getDoctor: async (id) => {
    const response = await apiClient.get(`/api/admin-entities/doctors/${id}`);
    return response.data;
  },
  createDoctor: async (doctorData) => {
    const response = await apiClient.post('/api/admin-entities/doctors', doctorData);
    return response.data;
  },
  updateDoctor: async (id, doctorData) => {
    const response = await apiClient.put(`/api/admin-entities/doctors/${id}`, doctorData);
    return response.data;
  },
  deleteDoctor: async (id) => {
    const response = await apiClient.delete(`/api/admin-entities/doctors/${id}`);
    return response.data;
  },
  getLabs: async () => {
    const response = await apiClient.get('/api/admin-entities/labs');
    return response.data;
  },
  createLab: async (labData) => {
    const response = await apiClient.post('/api/admin-entities/labs', labData);
    return response.data;
  },
  updateLab: async (id, labData) => {
    const response = await apiClient.put(`/api/admin-entities/labs/${id}`, labData);
    return response.data;
  },
  deleteLab: async (id) => {
    const response = await apiClient.delete(`/api/admin-entities/labs/${id}`);
    return response.data;
  },
  getPharmacies: async () => {
    const response = await apiClient.get('/api/admin-entities/pharmacies');
    return response.data;
  },
  createPharmacy: async (pharmacyData) => {
    const response = await apiClient.post('/api/admin-entities/pharmacies', pharmacyData);
    return response.data;
  },
  updatePharmacy: async (id, pharmacyData) => {
    const response = await apiClient.put(`/api/admin-entities/pharmacies/${id}`, pharmacyData);
    return response.data;
  },
  deletePharmacy: async (id) => {
    const response = await apiClient.delete(`/api/admin-entities/pharmacies/${id}`);
    return response.data;
  },
  getReceptions: async () => {
    const response = await apiClient.get('/api/admin-entities/receptions');
    return response.data;
  },
  createReception: async (receptionData) => {
    const response = await apiClient.post('/api/admin-entities/receptions', receptionData);
    return response.data;
  },
  updateReception: async (id, receptionData) => {
    const response = await apiClient.put(`/api/admin-entities/receptions/${id}`, receptionData);
    return response.data;
  },
  deleteReception: async (id) => {
    const response = await apiClient.delete(`/api/admin-entities/receptions/${id}`);
    return response.data;
  },
  getServices: async () => {
    const response = await apiClient.get('/api/admin-entities/services');
    return response.data;
  },
  createService: async (serviceData) => {
    const response = await apiClient.post('/api/admin-entities/services', serviceData);
    return response.data;
  },
  updateService: async (id, serviceData) => {
    const response = await apiClient.put(`/api/admin-entities/services/${id}`, serviceData);
    return response.data;
  },
  deleteService: async (id) => {
    const response = await apiClient.delete(`/api/admin-entities/services/${id}`);
    return response.data;
  },
};

export const receptionAPI = {
  getAllAppointments: async () => {
    const response = await apiClient.get('/api/reception/appointments');
    return response.data;
  },
  rescheduleAppointment: async (id, date, time) => {
    const response = await apiClient.patch(`/api/reception/appointments/${id}/reschedule`, { date, time });
    return response.data;
  },
  cancelAppointment: async (id) => {
    const response = await apiClient.patch(`/api/reception/appointments/${id}/cancel`);
    return response.data;
  }
};

export const labAPI = {
  getStats: async () => {
    const response = await apiClient.get('/api/lab/stats');
    return response.data;
  },
  getMyReports: async () => {
    const response = await apiClient.get('/api/lab/my-reports');
    return response.data;
  },
  getRequests: async (status) => {
    const response = await apiClient.get(`/api/lab/requests?status=${status || ''}`);
    return response.data;
  },
  updatePayment: async (id, paymentData) => {
    const response = await apiClient.patch(`/api/lab/update-payment/${id}`, paymentData);
    return response.data;
  },
  uploadReport: async (id, formData) => {
    const response = await apiClient.post(`/api/lab/upload-report/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }
};

// NEW: Pharmacy API for user-specific data


export const publicAPI = {
  getServices: async () => {
    const response = await apiClient.get('/api/public/services');
    return response.data;
  },
  getDoctors: async (serviceId = null) => {
    const url = serviceId ? `/api/doctor?serviceId=${serviceId}` : '/api/doctor';
    const response = await apiClient.get(url);
    return response.data;
  },
};

export const uploadAPI = {
  uploadImages: async (formData) => {
    const response = await apiClient.post('/api/upload/images', formData);
    return response.data;
  },
};
export const pharmacyAPI = {
    getInventory: async () => {
        const response = await apiClient.get('/api/pharmacy/inventory');
        return response.data;
    },
    addMedicine: async (data) => {
        const response = await apiClient.post('/api/pharmacy/inventory', data);
        return response.data;
    },
    deleteMedicine: async (id) => {
        const response = await apiClient.delete(`/api/pharmacy/inventory/${id}`);
        return response.data;
    }
};

export const pharmacyOrderAPI = {
    getOrders: async () => {
        const response = await apiClient.get('/api/pharmacy/orders');
        return response.data;
    },
    completeOrder: async (id) => {
        const response = await apiClient.patch(`/api/pharmacy/orders/${id}/complete`);
        return response.data;
    }
};

export default apiClient;