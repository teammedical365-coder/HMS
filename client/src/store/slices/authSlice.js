import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authAPI, adminAPI, hospitalAdminAPI } from '../../utils/api';

// ══════════════════════════════════════════════════════════════════════════════
// OTP-Based Login Thunks
// ══════════════════════════════════════════════════════════════════════════════

/** Step 1: Validate credentials and send OTP email (or bypass OTP if disabled) */
export const sendOtp = createAsyncThunk(
  'auth/sendOtp',
  async ({ email, password, hospitalId, loginType }, { rejectWithValue }) => {
    try {
      const response = await authAPI.sendOtp(email, password, hospitalId, loginType);
      if (response.success) {
        // When OTP is bypassed and no active session, login is complete — persist to localStorage
        if (response.otpBypassed && !response.activeSessionExists && response.token) {
          localStorage.setItem('token', response.token);
          localStorage.setItem('user', JSON.stringify(response.user));
        }
        return response;
      }
      return rejectWithValue(response.message || 'Failed to send OTP');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to send OTP');
    }
  }
);

/** Step 2: Verify OTP code */
export const verifyOtp = createAsyncThunk(
  'auth/verifyOtp',
  async ({ preAuthToken, otp }, { rejectWithValue }) => {
    try {
      const response = await authAPI.verifyOtp(preAuthToken, otp);
      if (response.success) {
        // If no active session → login is complete (token + user returned)
        if (!response.activeSessionExists && response.token) {
          localStorage.setItem('token', response.token);
          localStorage.setItem('user', JSON.stringify(response.user));
        }
        return response;
      }
      return rejectWithValue(response.message || 'OTP verification failed');
    } catch (error) {
      const data = error.response?.data;
      return rejectWithValue({
        message: data?.message || 'OTP verification failed',
        otpExpired: data?.otpExpired || false,
        attemptsRemaining: data?.attemptsRemaining,
      });
    }
  }
);

/** Step 2b: Resend OTP */
export const resendOtp = createAsyncThunk(
  'auth/resendOtp',
  async ({ preAuthToken }, { rejectWithValue }) => {
    try {
      const response = await authAPI.resendOtp(preAuthToken);
      if (response.success) return response;
      return rejectWithValue(response.message || 'Failed to resend OTP');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to resend OTP');
    }
  }
);

/** Step 3: Force login — invalidate previous session and create new one */
export const forceLogin = createAsyncThunk(
  'auth/forceLogin',
  async ({ preAuthToken }, { rejectWithValue }) => {
    try {
      const response = await authAPI.forceLogin(preAuthToken);
      if (response.success) {
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        return response;
      }
      return rejectWithValue(response.message || 'Failed to complete login');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to complete login');
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// Legacy Thunks (kept for backwards compatibility — signup flows)
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// Initial State
// ══════════════════════════════════════════════════════════════════════════════

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
      // OTP flow state
      otpStep: null,           // 'credentials' | 'otp' | 'session_check' | null
      preAuthToken: null,      // short-lived JWT for OTP flow
      otpEmail: null,          // masked email for display
      activeSession: null,     // { browser, os, lastActive } if session conflict
      otpSuccessMsg: null,     // "OTP resent" etc.
      sessionExpiredMessage: null, // force-logout notification
    };
  } catch {
    return {
      user: null,
      token: null,
      isAuthenticated: false,
      loading: false,
      error: null,
      otpStep: null,
      preAuthToken: null,
      otpEmail: null,
      activeSession: null,
      otpSuccessMsg: null,
      sessionExpiredMessage: null,
    };
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// Slice
// ══════════════════════════════════════════════════════════════════════════════

const authSlice = createSlice({
  name: 'auth',
  initialState: loadInitialState(),
  reducers: {
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
      state.otpStep = null;
      state.preAuthToken = null;
      state.otpEmail = null;
      state.activeSession = null;
      state.otpSuccessMsg = null;
      state.sessionExpiredMessage = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
    clearError: (state) => {
      state.error = null;
      state.otpSuccessMsg = null;
    },
    updateUser: (state, action) => {
      state.user = { ...state.user, ...action.payload };
      localStorage.setItem('user', JSON.stringify(state.user));
    },
    /** Reset OTP flow state — return to credentials step */
    resetOtpFlow: (state) => {
      state.otpStep = null;
      state.preAuthToken = null;
      state.otpEmail = null;
      state.activeSession = null;
      state.error = null;
      state.otpSuccessMsg = null;
    },
    /** Clear session expired message after it's been shown */
    clearSessionExpiredMessage: (state) => {
      state.sessionExpiredMessage = null;
    },
    /** Set session expired message (called from components that read sessionStorage) */
    setSessionExpiredMessage: (state, action) => {
      state.sessionExpiredMessage = action.payload;
    },
  },
  extraReducers: (builder) => {
    // ── Send OTP ──────────────────────────────────────────────────────────
    builder.addCase(sendOtp.pending, (state) => {
      state.loading = true;
      state.error = null;
      state.otpSuccessMsg = null;
    });
    builder.addCase(sendOtp.fulfilled, (state, action) => {
      state.loading = false;

      if (action.payload.otpBypassed) {
        // OTP is disabled (AUTH_OTP_ENABLED=false) — backend handled login directly
        if (action.payload.activeSessionExists) {
          // Active session detected — show session conflict modal
          state.otpStep = 'session_check';
          state.preAuthToken = action.payload.preAuthToken;
          state.activeSession = action.payload.activeSession;
        } else {
          // No active session — login is complete
          state.user = action.payload.user;
          state.token = action.payload.token;
          state.isAuthenticated = true;
          state.otpStep = null;
          state.preAuthToken = null;
          state.otpEmail = null;
          state.activeSession = null;
        }
      } else {
        // Normal OTP flow — show OTP verification form
        state.otpStep = 'otp';
        state.preAuthToken = action.payload.preAuthToken;
        state.otpEmail = action.payload.email;
      }
    });
    builder.addCase(sendOtp.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    });

    // ── Verify OTP ────────────────────────────────────────────────────────
    builder.addCase(verifyOtp.pending, (state) => {
      state.loading = true;
      state.error = null;
      state.otpSuccessMsg = null;
    });
    builder.addCase(verifyOtp.fulfilled, (state, action) => {
      state.loading = false;
      if (action.payload.activeSessionExists) {
        // Show session conflict modal
        state.otpStep = 'session_check';
        state.activeSession = action.payload.activeSession;
      } else {
        // Login complete
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.otpStep = null;
        state.preAuthToken = null;
        state.otpEmail = null;
        state.activeSession = null;
      }
    });
    builder.addCase(verifyOtp.rejected, (state, action) => {
      state.loading = false;
      const payload = action.payload;
      if (typeof payload === 'object' && payload !== null) {
        state.error = payload.message || 'OTP verification failed';
        if (payload.otpExpired) {
          // Reset to credentials step on expiry
          state.otpStep = null;
          state.preAuthToken = null;
          state.otpEmail = null;
        }
      } else {
        state.error = payload || 'OTP verification failed';
      }
    });

    // ── Resend OTP ────────────────────────────────────────────────────────
    builder.addCase(resendOtp.pending, (state) => {
      state.loading = true;
      state.error = null;
      state.otpSuccessMsg = null;
    });
    builder.addCase(resendOtp.fulfilled, (state, action) => {
      state.loading = false;
      state.otpSuccessMsg = action.payload.message || 'New OTP sent successfully';
    });
    builder.addCase(resendOtp.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    });

    // ── Force Login ───────────────────────────────────────────────────────
    builder.addCase(forceLogin.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(forceLogin.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
      state.otpStep = null;
      state.preAuthToken = null;
      state.otpEmail = null;
      state.activeSession = null;
    });
    builder.addCase(forceLogin.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    });

    // ── Legacy Login User ─────────────────────────────────────────────────
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

export const { logout, clearError, updateUser, resetOtpFlow, clearSessionExpiredMessage, setSessionExpiredMessage } = authSlice.actions;
export default authSlice.reducer;
