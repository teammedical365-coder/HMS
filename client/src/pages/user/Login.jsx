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

  const [formData, setFormData] = useState({ email: '', password: '' });

  useEffect(() => { dispatch(clearError()); }, [dispatch]);

  useEffect(() => {
    if (isAuthenticated && user) {
      const redirectMap = {
        admin: '/admin', superadmin: '/superadmin', doctor: '/doctor/patients',
        nurse: '/doctor/patients', lab: '/lab/dashboard', pharmacy: '/pharmacy/dashboard',
        reception: '/reception/dashboard', accountant: '/accountant/dashboard', patient: '/dashboard'
      };
      const role = (user.role || '').toLowerCase();
      navigate(redirectMap[role] || searchParams.get('redirect') || '/my-dashboard');
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
    await dispatch(loginUser({ email: formData.email, password: formData.password }));
  };

  return (
    <section className="auth-section">
      <div className="auth-blob blob-1" />
      <div className="auth-blob blob-2" />

      <div className="auth-card">
        {/* Left: Form */}
        <div className="auth-form-container">
          <div className="auth-box">
            <div className="auth-brand">
              <div className="auth-brand-icon">🏥</div>
              <span className="auth-brand-name">MediCRM HMS</span>
            </div>

            <h2>Welcome back</h2>
            <p>Sign in to your secure hospital workspace.</p>

            {error && (
              <div className="error-message">
                ⚠️ {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label>Email Address</label>
                <div className="input-wrapper">
                  <input
                    type="email"
                    name="email"
                    placeholder="name@hospital.com"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Password</label>
                <div className="input-wrapper">
                  <input
                    type="password"
                    name="password"
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="auth-row">
                <label>
                  <input type="checkbox" style={{ accentColor: 'var(--brand-600)' }} />
                  &nbsp;Remember me
                </label>
                <a href="#">Forgot Password?</a>
              </div>

              <button className="btn-primary btn-block" disabled={loading}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                    Signing In...
                  </span>
                ) : 'Sign In →'}
              </button>
            </form>

            <div className="divider"><span>or continue with</span></div>

            <div className="social-login">
              <div className="social-btn" title="Google">G</div>
              <div className="social-btn" title="Microsoft">M</div>
              <div className="social-btn" title="SSO">🔒</div>
            </div>

            <p className="switch-text">
              New here? <Link to="/signup" className="switch-link">Create Account</Link>
            </p>
          </div>
        </div>

        {/* Right: Visual */}
        <div className="auth-visual">
          <img
            src="https://images.unsplash.com/photo-1538108149393-ceefbce54471?q=80&w=1000&auto=format&fit=crop"
            alt="Hospital Management"
          />
          <div className="auth-features">
            <div className="auth-feature-chip">✅ Secure & HIPAA Compliant</div>
            <div className="auth-feature-chip">🔒 End-to-End Encrypted</div>
            <div className="auth-feature-chip">⚡ Real-time Updates</div>
          </div>
          <div className="auth-content">
            <h2>Streamline Your <br /> Healthcare Operations.</h2>
            <p>Empowering your staff to focus on patient care with seamlessly integrated digital workflows.</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Login;