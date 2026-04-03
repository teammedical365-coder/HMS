import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { loginUser, clearError } from '../../store/slices/authSlice';
import { motion } from 'framer-motion';
import { RiInformationLine } from 'react-icons/ri';
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
      <div className="auth-container">
        <div className="auth-blob blob-1" />
        <div className="auth-blob blob-2" />

        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="auth-card"
        >
          {/* Left: Form */}
          <div className="auth-form-container">
            <div className="auth-box">
              <div className="hospital-brand">
                  <img src="https://www.medical365.in/logo/medical365fav.jpg" alt="Medical 365" style={{ height: '40px', objectFit: 'contain' }} />
              </div>

              <div className="auth-header">
                <h3>Global Instance Login</h3>
                <p>Access management for distributed medical nodes.</p>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', gap: '12px', color: '#0f172a', fontWeight: '700', marginBottom: '8px', alignItems: 'center' }}>
                    <RiInformationLine style={{ color: '#14b8a6', fontSize: '1.2rem' }} />
                    Secure Access Only
                </div>
                <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', lineHeight: '1.6' }}>
                  For enhanced data isolation, you must sign in through your <strong>private hospital portal link</strong>.
                </p>
              </div>

              <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '12px', padding: '1rem', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ fontSize: '0.9rem', color: '#854d0e' }}>
                    <strong>Access Tip:</strong> Check your institution's registration email for your unique login URL.
                </div>
              </div>

              <div className="auth-footer-note" style={{ marginTop: '3rem' }}>
                System-wide isolation enabled
              </div>
            </div>
          </div>

          {/* Right: Visual */}
          <div className="auth-visual">
            <img
              src="https://images.unsplash.com/photo-1576091160550-217359f4268e?q=80&w=1000&auto=format&fit=crop"
              alt="Medical Data Center"
              className="auth-hero-img"
              style={{ opacity: 0.3 }}
            />
            <div className="auth-visual-overlay"></div>
            <div className="auth-content">
              <div className="visual-badge">Security Node</div>
              <h2>Enterprise Grade <br /> Isolation.</h2>
              <p>
                Each hospital operates on an independent logical partition. This global login gate is closed for public access.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Login;