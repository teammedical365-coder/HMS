import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { signupUser, clearError } from '../../store/slices/authSlice';
import './Signup.css';

const Signup = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { loading, error, isAuthenticated } = useAuth();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: ''
  });
  
  useEffect(() => {
    if (isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);
  
  useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    dispatch(clearError());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    dispatch(clearError());

    if (formData.password !== formData.confirmPassword) {
       // You might want to dispatch a local error here
       return;
    }

    await dispatch(signupUser({
      name: formData.name,
      email: formData.email,
      password: formData.password,
      phone: formData.phone
    }));
  };

  return (
    <section className="auth-section">
      <div className="auth-blob blob-1"></div>
      <div className="auth-blob blob-2"></div>

      <div className="auth-card">
        <div className="auth-form-container">
          <div id="signup-box" className="auth-box show">
            <h2 style={{ marginBottom: '5px' }}>Start Your Journey</h2>
            <p style={{ color: '#666', marginBottom: '30px' }}>Create an account to book and track appointments.</p>
            
            {error && <div className="error-message" style={{ marginBottom: '20px' }}>{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label>Full Name</label>
                <div className="input-wrapper">
                  <i className="fa-regular fa-user"></i>
                  <input 
                    type="text" 
                    name="name" 
                    placeholder="e.g. John Doe" 
                    value={formData.name} 
                    onChange={handleChange} 
                    required 
                  />
                </div>
              </div>

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
                <label>Phone Number</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-phone"></i>
                  <input 
                    type="tel" 
                    name="phone" 
                    placeholder="Your contact number" 
                    value={formData.phone} 
                    onChange={handleChange} 
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Create Password</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-lock"></i>
                  <input 
                    type="password" 
                    name="password" 
                    placeholder="Min 6 characters" 
                    value={formData.password} 
                    onChange={handleChange} 
                    required 
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Confirm Password</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-shield-halved"></i>
                  <input 
                    type="password" 
                    name="confirmPassword" 
                    placeholder="Repeat your password" 
                    value={formData.confirmPassword} 
                    onChange={handleChange} 
                    required 
                  />
                </div>
              </div>

              <button className="btn-primary btn-block" disabled={loading}>
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>

            <p className="switch-text" style={{ marginTop: '20px' }}>
              Already have an account? <Link to="/login" className="switch-link">Sign In</Link>
            </p>
          </div>
        </div>

        <div className="auth-visual">
          <img src="https://images.unsplash.com/photo-1519689680058-324335c77eba?q=80&w=1000&auto=format&fit=crop" alt="Happy Family" />
          <div className="auth-content auth-box show">
            <h2>A New Beginning <br /> Starts Here.</h2>
            <p>Join over 1,500+ happy families who trusted Krisna IVF to make their dreams come true.</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Signup;