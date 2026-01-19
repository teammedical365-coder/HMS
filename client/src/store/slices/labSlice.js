// client/src/store/slices/labSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { labAPI } from '../../utils/api';

// --- Thunks ---

export const fetchLabStats = createAsyncThunk(
  'lab/fetchStats',
  async (_, { rejectWithValue }) => {
    try {
      return await labAPI.getStats();
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch stats');
    }
  }
);

export const fetchLabRequests = createAsyncThunk(
  'lab/fetchRequests',
  async (status, { rejectWithValue }) => {
    try {
      return await labAPI.getRequests(status);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch requests');
    }
  }
);

export const updateLabPayment = createAsyncThunk(
  'lab/updatePayment',
  async ({ id, paymentData }, { rejectWithValue }) => {
    try {
      return await labAPI.updatePayment(id, paymentData);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Payment update failed');
    }
  }
);

export const uploadLabReport = createAsyncThunk(
  'lab/uploadReport',
  async ({ id, formData }, { rejectWithValue }) => {
    try {
      return await labAPI.uploadReport(id, formData);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Upload failed');
    }
  }
);

export const fetchMyLabReports = createAsyncThunk(
  'lab/fetchMyReports',
  async (_, { rejectWithValue }) => {
    try {
      return await labAPI.getMyReports();
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch reports');
    }
  }
);

// --- Slice ---

const labSlice = createSlice({
  name: 'lab',
  initialState: {
    stats: { total: 0, pending: 0, completed: 0 },
    requests: [], // Used for both technician requests and patient reports
    loading: false,
    error: null,
    uploadSuccess: null
  },
  reducers: {
    clearLabErrors: (state) => {
      state.error = null;
      state.uploadSuccess = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch Stats
      .addCase(fetchLabStats.pending, (state) => { state.loading = true; })
      .addCase(fetchLabStats.fulfilled, (state, action) => {
        state.loading = false;
        state.stats = action.payload.stats;
      })
      .addCase(fetchLabStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Fetch Requests (Technician view)
      .addCase(fetchLabRequests.pending, (state) => { state.loading = true; })
      .addCase(fetchLabRequests.fulfilled, (state, action) => {
        state.loading = false;
        state.requests = action.payload.requests;
      })
      .addCase(fetchLabRequests.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch My Reports (Patient view) - UPDATED
      .addCase(fetchMyLabReports.pending, (state) => { state.loading = true; })
      .addCase(fetchMyLabReports.fulfilled, (state, action) => {
        state.loading = false;
        state.requests = action.payload.reports; // Populate with the patient's reports
      })
      .addCase(fetchMyLabReports.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Update Lab Payment
      .addCase(updateLabPayment.pending, (state) => { state.loading = true; })
      .addCase(updateLabPayment.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.requests.findIndex(req => req._id === action.payload.report._id);
        if (index !== -1) state.requests[index] = action.payload.report;
      })
      .addCase(updateLabPayment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Upload Lab Report
      .addCase(uploadLabReport.pending, (state) => { state.loading = true; })
      .addCase(uploadLabReport.fulfilled, (state, action) => {
        state.loading = false;
        state.uploadSuccess = 'Report uploaded successfully';
        state.requests = state.requests.filter(req => req._id !== action.payload.report._id);
        state.stats.pending -= 1;
        state.stats.completed += 1;
      })
      .addCase(uploadLabReport.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearLabErrors } = labSlice.actions;
export default labSlice.reducer;