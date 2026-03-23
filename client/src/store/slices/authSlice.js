import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authAPI, adminAPI, hospitalAdminAPI } from '../../utils/api';

// Async Thunks
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async ({ email, password, hospitalId }, { rejectWithValue }) => {
    try {
      const response = await authAPI.login(email, password, hospitalId);
      if (response.success) {
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        return response;
      }
      return rejectWithValue(response.message || 'Login failed');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Login failed');
    }
  }
);

export const signupUser = createAsyncThunk(
  'auth/signupUser',
  async ({ name, email, password, phone }, { rejectWithValue }) => {
    try {
      const response = await authAPI.signup(name, email, password, phone);
      if (response.success) {
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        return response;
      }
      return rejectWithValue(response.message || 'Signup failed');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Signup failed');
    }
  }
);

export const loginAdmin = createAsyncThunk(
  'auth/loginAdmin',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await adminAPI.login(email, password);
      if (response.success) {
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        return response;
      }
      return rejectWithValue(response.message || 'Login failed');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Login failed');
    }
  }
);

export const loginHospitalAdmin = createAsyncThunk(
  'auth/loginHospitalAdmin',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await hospitalAdminAPI.login(email, password);
      if (response.success) {
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        return response;
      }
      return rejectWithValue(response.message || 'Login failed');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Login failed');
    }
  }
);

export const signupAdmin = createAsyncThunk(
  'auth/signupAdmin',
  async ({ name, email, password, phone }, { rejectWithValue }) => {
    try {
      const response = await adminAPI.signup(name, email, password, phone);
      if (response.success) {
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        return response;
      }
      return rejectWithValue(response.message || 'Signup failed');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Signup failed');
    }
  }
);

// Load initial state from localStorage
const loadInitialState = () => {
  try {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;

    return {
      user,
      token,
      isAuthenticated: !!(token && user),
      loading: false,
      error: null,
    };
  } catch {
    return {
      user: null,
      token: null,
      isAuthenticated: false,
      loading: false,
      error: null,
    };
  }
};

const authSlice = createSlice({
  name: 'auth',
  initialState: loadInitialState(),
  reducers: {
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
    clearError: (state) => {
      state.error = null;
    },
    updateUser: (state, action) => {
      state.user = { ...state.user, ...action.payload };
      localStorage.setItem('user', JSON.stringify(state.user));
    }
  },
  extraReducers: (builder) => {
    // Login User
    builder.addCase(loginUser.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(loginUser.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
    });
    builder.addCase(loginUser.rejected, (state, action) => { state.loading = false; state.error = action.payload; });

    // Signup User
    builder.addCase(signupUser.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(signupUser.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
    });
    builder.addCase(signupUser.rejected, (state, action) => { state.loading = false; state.error = action.payload; });

    // Login Admin
    builder.addCase(loginAdmin.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(loginAdmin.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
    });
    builder.addCase(loginAdmin.rejected, (state, action) => { state.loading = false; state.error = action.payload; });

    // Signup Admin
    builder.addCase(signupAdmin.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(signupAdmin.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
    });
    builder.addCase(signupAdmin.rejected, (state, action) => { state.loading = false; state.error = action.payload; });

    // Login Hospital Admin
    builder.addCase(loginHospitalAdmin.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(loginHospitalAdmin.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
    });
    builder.addCase(loginHospitalAdmin.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export const { logout, clearError, updateUser } = authSlice.actions;
export default authSlice.reducer;
