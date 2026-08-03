import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { sendOtp, verifyOtp, resendOtp, forceLogin, clearError, resetOtpFlow } from '../../store/slices/authSlice';
import '../user/Login.css';
import PasswordInput from '../../components/PasswordInput';
import OtpVerification from '../../components/OtpVerification';
import ActiveSessionModal from '../../components/ActiveSessionModal';

const AdminLogin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const { loading, error, isAuthenticated, user, otpStep, preAuthToken, otpEmail, activeSession, otpSuccessMsg } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [sessionBanner, setSessionBanner] = useState(null);

  // Check for session expired message
  useEffect(() => {
    const msg = sessionStorage.getItem('sessionExpiredMessage');
    if (msg) {
      setSessionBanner(msg);
      sessionStorage.removeItem('sessionExpiredMessage');
    }
  }, []);

  useEffect(() => {
    dispatch(clearError());
    dispatch(resetOtpFlow());
  }, [dispatch]);

  useEffect(() => {
    if (isAuthenticated && user) {
      const userRole = user.role;
      const normalizedRole = userRole ? userRole.toLowerCase() : '';

      let targetPath = '/my-dashboard';
      if (normalizedRole === 'centraladmin' || normalizedRole === 'superadmin') {
        targetPath = '/supremeadmin';
      } else if (normalizedRole === 'hospitaladmin') {
        targetPath = '/hospitaladmin';
      } else if (normalizedRole === 'admin') {
        targetPath = '/admin';
      }

      navigate(targetPath);
    }
  }, [isAuthenticated, user, navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    dispatch(clearError());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    dispatch(clearError());
    if (!formData.email || !formData.password) return;
    setSessionBanner(null);

    // Use OTP flow instead of direct admin login
    await dispatch(sendOtp({
      email: formData.email,
      password: formData.password,
      loginType: 'admin',
    }));
  };

  const handleVerifyOtp = async (otp) => {
    await dispatch(verifyOtp({ preAuthToken, otp }));
  };

  const handleResendOtp = async () => {
    await dispatch(resendOtp({ preAuthToken }));
  };

  const handleBackToLogin = () => {
    dispatch(resetOtpFlow());
  };

  const handleForceLogin = async () => {
    await dispatch(forceLogin({ preAuthToken }));
  };

  const handleCancelSession = () => {
    dispatch(resetOtpFlow());
  };

  const handleGoBack = () => {
    navigate("/"); // Go back to home page
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          {/* Back Button — only on credentials step */}
          {!otpStep && (
            <button
              onClick={handleGoBack}
              className="back-button"
              type="button"
            >
              <span className="back-icon">←</span>
              <span>Go Back</span>
            </button>
          )}

          <div className="auth-header">
            <h1>Central Admin Login</h1>
            <p>Sign in to your Central Admin account</p>
          </div>

          {/* Session Expired Banner */}
          {sessionBanner && (
            <div style={{
              background: '#fef3c7',
              border: '1px solid #fbbf24',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: '#92400e',
            }}>
              ⚠️ {sessionBanner}
            </div>
          )}

          {/* ── Step 1: Credentials ── */}
          {!otpStep && (
            <>
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="auth-form">
                <div className="form-group">
                  <label htmlFor="email">Email Address</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter your email"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <PasswordInput
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="auth-button"
                  disabled={loading}
                >
                  {loading ? 'Authenticating...' : 'Sign In'}
                </button>
              </form>

              <div className="auth-footer">
                <p>
                  Don't have a Central Admin account?{' '}
                  <Link to="/supremeadmin/signup" className="auth-link">
                    Sign Up
                  </Link>
                </p>
                <p style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-gray)' }}>
                  Regular users should use{' '}
                  <Link to="/login" className="auth-link" style={{ fontSize: '0.85rem' }}>
                    user login
                  </Link>
                </p>
              </div>
            </>
          )}

          {/* ── Step 2: OTP Verification ── */}
          {otpStep === 'otp' && (
            <OtpVerification
              email={otpEmail}
              onVerify={handleVerifyOtp}
              onResend={handleResendOtp}
              onBack={handleBackToLogin}
              loading={loading}
              error={error}
              successMsg={otpSuccessMsg}
            />
          )}
        </div>
      </div>

      {/* Active Session Modal */}
      {otpStep === 'session_check' && activeSession && (
        <ActiveSessionModal
          activeSession={activeSession}
          onForceLogin={handleForceLogin}
          onCancel={handleCancelSession}
          loading={loading}
        />
      )}
    </div>
  );
};

export default AdminLogin;
