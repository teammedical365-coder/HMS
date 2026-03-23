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
            <div className="auth-brand" style={{ marginBottom: '16px' }}>
              <div className="auth-brand-icon">🏥</div>
              <span className="auth-brand-name">MediCRM HMS</span>
            </div>

            <h2>Access Restricted</h2>
            <p style={{ color: '#666', fontSize: '0.95rem', lineHeight: '1.5' }}>
              For enhanced security and data isolation, general login has been disabled. 
              <strong> You must access the system through your specific hospital's portal URL.</strong>
            </p>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', margin: '24px 0', fontSize: '0.9rem', color: '#475569' }}>
              <strong>Example:</strong><br />
              <code>https://your-hospital.com/<b>your-clinic-name</b>/login</code>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              If you do not know your hospital's portal link, please contact your Central Administrator.
            </p>

            <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
              <strong>Admin Access:</strong> <br />
              <Link to="/hospitaladmin/login" style={{ color: 'var(--brand-pink)', marginRight: '16px' }}>Hospital Admin</Link>
              <Link to="/supremeadmin/login" style={{ color: '#6c63ff' }}>Central Admin</Link>
            </div>
          </div>
        </div>

        {/* Right: Visual */}
        <div className="auth-visual">
          <img
            src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=1000&auto=format&fit=crop"
            alt="Hospital Network"
            style={{ filter: 'brightness(0.9)' }}
          />
          <div className="auth-content auth-box">
            <h2>Dedicated Private Portals</h2>
            <p>
              Each hospital operates within its own completely isolated environment, ensuring maximum security and row-level data segregation.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Login;