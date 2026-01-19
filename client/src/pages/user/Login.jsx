import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { loginUser, clearError } from '../../store/slices/authSlice';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const { loading, error, isAuthenticated, user } = useAuth();
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);

  useEffect(() => {
    if (isAuthenticated && user) {
      const userRole = user.role;
      const redirectMap = {
        admin: '/admin',
        doctor: '/doctor/patients',
        lab: '/lab/dashboard',
        pharmacy: '/pharmacy/dashboard',
        reception: '/reception/dashboard'
      };
      navigate(redirectMap[userRole] || searchParams.get('redirect') || '/dashboard');
    }
  }, [isAuthenticated, user, navigate, searchParams]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    dispatch(clearError());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    dispatch(clearError());
    if (!formData.email || !formData.password) return;

    await dispatch(loginUser({
      email: formData.email,
      password: formData.password
    }));
  };

  return (
    <section className="auth-section">
      {/* Decorative Blobs */}
      <div className="auth-blob blob-1"></div>
      <div className="auth-blob blob-2"></div>

      <div className="auth-card">
        {/* Left Side: Form Area */}
        <div className="auth-form-container">
          <div id="login-box" className="auth-box show">
            <h2 style={{ marginBottom: '5px' }}>Welcome Back</h2>
            <p style={{ color: '#666', marginBottom: '30px' }}>Access your patient portal securely.</p>
            
            {error && <div className="error-message" style={{ marginBottom: '20px' }}>{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label>Email Address</label>
                <div className="input-wrapper">
                  <i className="fa-regular fa-envelope"></i>
                  <input 
                    type="email" 
                    name="email"
                    placeholder="e.g. name@example.com" 
                    value={formData.email}
                    onChange={handleChange}
                    required 
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Password</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-lock"></i>
                  <input 
                    type="password" 
                    name="password"
                    placeholder="••••••••" 
                    value={formData.password}
                    onChange={handleChange}
                    required 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', fontSize: '0.9rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#666', fontWeight: '400' }}>
                  <input type="checkbox" /> Remember me
                </label>
                <a href="#" style={{ color: 'var(--brand-pink)' }}>Forgot Password?</a>
              </div>

              <button className="btn-primary btn-block" disabled={loading}>
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>

            <div className="divider"><span>Or continue with</span></div>
            <div className="social-login">
              <div className="social-btn" title="Login with Google"><i className="fa-brands fa-google"></i></div>
              <div className="social-btn" title="Login with Facebook"><i className="fa-brands fa-facebook-f"></i></div>
              <div className="social-btn" title="Login with Apple"><i className="fa-brands fa-apple"></i></div>
            </div>

            <p className="switch-text">
              New to Krisna IVF? <Link to="/signup" className="switch-link">Create Account</Link>
            </p>
          </div>
        </div>

        {/* Right Side: Visual Content */}
        <div className="auth-visual">
          <img src="https://images.unsplash.com/photo-1519689680058-324335c77eba?q=80&w=1000&auto=format&fit=crop" alt="Happy Family" />
          <div className="auth-content auth-box show">
            <h2>Your Trust, <br /> Our Commitment.</h2>
            <p>Login to view your treatment plans, test reports, and upcoming schedules with complete privacy.</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Login;