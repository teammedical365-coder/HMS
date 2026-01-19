import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { adminEntitiesAPI } from '../../utils/api';

// Async thunks for Doctors
export const fetchAdminDoctors = createAsyncThunk(
  'adminEntities/fetchDoctors',
  async (_, { rejectWithValue }) => {
    try {
      const response = await adminEntitiesAPI.getDoctors();
      if (response.success) {
        return response.doctors || [];
      }
      return rejectWithValue(response.message || 'Failed to fetch doctors');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch doctors');
    }
  }
);

export const createDoctor = createAsyncThunk(
  'adminEntities/createDoctor',
  async (doctorData, { rejectWithValue }) => {
    try {
      const response = await adminEntitiesAPI.createDoctor(doctorData);
      if (response.success) {
        return response.doctor;
      }
      return rejectWithValue(response.message || 'Failed to create doctor');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create doctor');
    }
  }
);

export const updateDoctor = createAsyncThunk(
  'adminEntities/updateDoctor',
  async ({ id, doctorData }, { rejectWithValue }) => {
    try {
      const response = await adminEntitiesAPI.updateDoctor(id, doctorData);
      if (response.success) {
        return response.doctor;
      }
      return rejectWithValue(response.message || 'Failed to update doctor');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update doctor');
    }
  }
);

export const deleteDoctor = createAsyncThunk(
  'adminEntities/deleteDoctor',
  async (id, { rejectWithValue }) => {
    try {
      const response = await adminEntitiesAPI.deleteDoctor(id);
      if (response.success) {
        return id;
      }
      return rejectWithValue(response.message || 'Failed to delete doctor');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete doctor');
    }
  }
);

// Similar patterns for Labs, Pharmacies, Receptions, Services
export const fetchLabs = createAsyncThunk(
  'adminEntities/fetchLabs',
  async (_, { rejectWithValue }) => {
    try {
      const response = await adminEntitiesAPI.getLabs();
      return response.success ? (response.labs || []) : rejectWithValue(response.message);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch labs');
    }
  }
);

export const fetchPharmacies = createAsyncThunk(
  'adminEntities/fetchPharmacies',
  async (_, { rejectWithValue }) => {
    try {
      const response = await adminEntitiesAPI.getPharmacies();
      return response.success ? (response.pharmacies || []) : rejectWithValue(response.message);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch pharmacies');
    }
  }
);

export const fetchReceptions = createAsyncThunk(
  'adminEntities/fetchReceptions',
  async (_, { rejectWithValue }) => {
    try {
      const response = await adminEntitiesAPI.getReceptions();
      return response.success ? (response.receptions || []) : rejectWithValue(response.message);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch receptions');
    }
  }
);

export const fetchAdminServices = createAsyncThunk(
  'adminEntities/fetchServices',
  async (_, { rejectWithValue }) => {
    try {
      const response = await adminEntitiesAPI.getServices();
      return response.success ? (response.services || []) : rejectWithValue(response.message);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch services');
    }
  }
);

const adminEntitiesSlice = createSlice({
  name: 'adminEntities',
  initialState: {
    doctors: {
      data: [],
      loading: false,
      error: null,
    },
    labs: {
      data: [],
      loading: false,
      error: null,
    },
    pharmacies: {
      data: [],
      loading: false,
      error: null,
    },
    receptions: {
      data: [],
      loading: false,
      error: null,
    },
    services: {
      data: [],
      loading: false,
      error: null,
    },
  },
  reducers: {
    clearErrors: (state) => {
      state.doctors.error = null;
      state.labs.error = null;
      state.pharmacies.error = null;
      state.receptions.error = null;
      state.services.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Doctors
      .addCase(fetchAdminDoctors.pending, (state) => {
        state.doctors.loading = true;
        state.doctors.error = null;
      })
      .addCase(fetchAdminDoctors.fulfilled, (state, action) => {
        state.doctors.loading = false;
        state.doctors.data = action.payload;
      })
      .addCase(fetchAdminDoctors.rejected, (state, action) => {
        state.doctors.loading = false;
        state.doctors.error = action.payload;
      })
      .addCase(createDoctor.fulfilled, (state, action) => {
        state.doctors.data.unshift(action.payload);
      })
      .addCase(updateDoctor.fulfilled, (state, action) => {
        const index = state.doctors.data.findIndex((d) => d._id === action.payload._id);
        if (index !== -1) {
          state.doctors.data[index] = action.payload;
        }
      })
      .addCase(deleteDoctor.fulfilled, (state, action) => {
        state.doctors.data = state.doctors.data.filter((d) => d._id !== action.payload);
      })
      // Labs
      .addCase(fetchLabs.pending, (state) => {
        state.labs.loading = true;
        state.labs.error = null;
      })
      .addCase(fetchLabs.fulfilled, (state, action) => {
        state.labs.loading = false;
        state.labs.data = action.payload;
      })
      .addCase(fetchLabs.rejected, (state, action) => {
        state.labs.loading = false;
        state.labs.error = action.payload;
      })
      // Pharmacies
      .addCase(fetchPharmacies.pending, (state) => {
        state.pharmacies.loading = true;
        state.pharmacies.error = null;
      })
      .addCase(fetchPharmacies.fulfilled, (state, action) => {
        state.pharmacies.loading = false;
        state.pharmacies.data = action.payload;
      })
      .addCase(fetchPharmacies.rejected, (state, action) => {
        state.pharmacies.loading = false;
        state.pharmacies.error = action.payload;
      })
      // Receptions
      .addCase(fetchReceptions.pending, (state) => {
        state.receptions.loading = true;
        state.receptions.error = null;
      })
      .addCase(fetchReceptions.fulfilled, (state, action) => {
        state.receptions.loading = false;
        state.receptions.data = action.payload;
      })
      .addCase(fetchReceptions.rejected, (state, action) => {
        state.receptions.loading = false;
        state.receptions.error = action.payload;
      })
      // Services
      .addCase(fetchAdminServices.pending, (state) => {
        state.services.loading = true;
        state.services.error = null;
      })
      .addCase(fetchAdminServices.fulfilled, (state, action) => {
        state.services.loading = false;
        state.services.data = action.payload;
      })
      .addCase(fetchAdminServices.rejected, (state, action) => {
        state.services.loading = false;
        state.services.error = action.payload;
      });
  },
});

export const { clearErrors } = adminEntitiesSlice.actions;
export default adminEntitiesSlice.reducer;









