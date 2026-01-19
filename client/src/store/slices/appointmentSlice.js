import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../utils/api';

// Async thunks
export const fetchAppointments = createAsyncThunk(
  'appointments/fetchAppointments',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/api/appointments/my-appointments');
      if (response.data.success) {
        return response.data.appointments || [];
      }
      return rejectWithValue(response.data.message || 'Failed to fetch appointments');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch appointments');
    }
  }
);

export const createAppointment = createAsyncThunk(
  'appointments/createAppointment',
  async (appointmentData, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/api/appointments/create', appointmentData);
      if (response.data.success) {
        return response.data.appointment;
      }
      return rejectWithValue(response.data.message || 'Failed to create appointment');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create appointment');
    }
  }
);

export const updateAppointmentPayment = createAsyncThunk(
  'appointments/updatePayment',
  async ({ appointmentId }, { rejectWithValue }) => {
    try {
      const response = await apiClient.patch(`/api/appointments/${appointmentId}/payment`, {});
      if (response.data.success) {
        return response.data.appointment;
      }
      return rejectWithValue(response.data.message || 'Failed to update payment');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update payment');
    }
  }
);

const appointmentSlice = createSlice({
  name: 'appointments',
  initialState: {
    appointments: [],
    loading: false,
    error: null,
    lastFetched: null,
  },
  reducers: {
    clearAppointments: (state) => {
      state.appointments = [];
      state.lastFetched = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    addAppointment: (state, action) => {
      state.appointments.unshift(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Appointments
      .addCase(fetchAppointments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAppointments.fulfilled, (state, action) => {
        state.loading = false;
        state.appointments = action.payload;
        state.lastFetched = Date.now();
        state.error = null;
      })
      .addCase(fetchAppointments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Create Appointment
      .addCase(createAppointment.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createAppointment.fulfilled, (state, action) => {
        state.loading = false;
        state.appointments.unshift(action.payload);
        state.error = null;
      })
      .addCase(createAppointment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update Payment
      .addCase(updateAppointmentPayment.fulfilled, (state, action) => {
        const index = state.appointments.findIndex(
          (apt) => apt._id === action.payload._id
        );
        if (index !== -1) {
          state.appointments[index] = action.payload;
        }
      });
  },
});

export const { clearAppointments, clearError: clearAppointmentError, addAppointment } = appointmentSlice.actions;
export default appointmentSlice.reducer;

