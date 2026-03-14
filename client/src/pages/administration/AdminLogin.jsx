import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { loginAdmin, clearError } from '../../store/slices/authSlice';
import '../user/Login.css';

const AdminLogin = () => {
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

    await dispatch(loginAdmin({
      email: formData.email,
      password: formData.password
    }));
  };

  const handleGoBack = () => {
    navigate("/"); // Go back to home page
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          {/* Back Button */}
          <button
            onClick={handleGoBack}
            className="back-button"
            type="button"
          >
            <span className="back-icon">←</span>
            <span>Go Back</span>
          </button>

          <div className="auth-header">
            <h1>Central Admin Login</h1>
            <p>Sign in to your Central Admin account</p>
          </div>

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
              <input
                type="password"
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
              {loading ? 'Signing In...' : 'Sign In'}
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
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;

