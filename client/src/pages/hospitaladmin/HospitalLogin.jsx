import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { loginUser, clearError } from '../../store/slices/authSlice';
import { useBranding } from '../../context/BrandingContext';
import { getSubdomain } from '../../utils/subdomain';
import api from '../../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineMail, HiOutlineLockClosed } from 'react-icons/hi';
import { RiHospitalLine } from 'react-icons/ri';
import '../user/Login.css';
import './HospitalLogin.css';

/**
 * HospitalLogin — Subdomain-based hospital login page
 * URL: [subdomain].myurl.com/login  (e.g. akg-hospital.myurl.com/login)
 *
 * 1. Reads subdomain from window location
 * 2. Fetches hospital info (name, logo) from /api/hospitals/resolve/:slug
 * 3. Embeds hospitalId in the login dispatch so JWT gets the hospitalId
 * 4. After login, automatically redirects to the user's role dashboard
 */
const HospitalLogin = () => {
    const hospitalSlug = getSubdomain();
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { loading, error, isAuthenticated, user } = useAuth();
    const { loadBranding } = useBranding();

    const [hospital, setHospital] = useState(null);
    const [hospitalLoading, setHospitalLoading] = useState(true);
    const [hospitalError, setHospitalError] = useState('');
    const [formData, setFormData] = useState({ email: '', password: '' });

    // Resolve hospital by slug on mount
    useEffect(() => {
        const resolveHospital = async () => {
            try {
                setHospitalLoading(true);
                const res = await api.get(`/api/hospitals/resolve/${hospitalSlug}`);
                if (res.data.success) {
                    setHospital(res.data.hospital);
                    // 🎨 Apply this hospital's specific branding (colors, logo, title) 
                    // to the login page *before* the user even signs in.
                    if (res.data.hospital._id) {
                        loadBranding(res.data.hospital._id);
                    }
                } else {
                    setHospitalError('Hospital not found.');
                }
            } catch (err) {
                setHospitalError(
                    err.response?.data?.message || 'Could not load hospital. Check the URL and try again.'
                );
            } finally {
                setHospitalLoading(false);
            }
        };
        resolveHospital();
    }, [hospitalSlug]);

    // Redirect after successful login
    useEffect(() => {
        if (isAuthenticated && user) {
            const role = (user.role || '').toLowerCase();
            const redirectMap = { nurse: '/doctor/patients' };
            const rawPath = redirectMap[role] || user.dashboardPath || 'my-dashboard';
            const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
            
            // Re-mount the software onto the flat authenticated path
            navigate(cleanPath, { replace: true });
        }
    }, [isAuthenticated, user, navigate, hospitalSlug]);

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
        if (!formData.email || !formData.password) return;

        // Pass hospitalId along with credentials so backend can embed it in JWT
        await dispatch(loginUser({
            email: formData.email,
            password: formData.password,
            hospitalId: hospital?._id,     // Used by backend to scope the session
        }));
    };

    if (hospitalLoading) {
        return (
            <div className="hospital-login-loading">
                <div className="hospital-login-spinner"></div>
                <p>Loading hospital portal...</p>
            </div>
        );
    }

    if (hospitalError) {
        return (
            <div className="hospital-login-error-page">
                <div className="hospital-login-error-card">
                    <span className="error-icon">🏥</span>
                    <h2>Hospital Not Found</h2>
                    <p>{hospitalError}</p>
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                        URL: <code>/{hospitalSlug}/login</code>
                    </p>
                    <button onClick={() => navigate('/login')} className="btn-primary" style={{ marginTop: '16px' }}>
                        Go to General Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <section className="auth-section">
            <AnimatePresence>
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="auth-container"
                >
                    <div className="auth-blob blob-1"></div>
                    <div className="auth-blob blob-2"></div>

                    <motion.div 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="auth-card"
                    >
                        {/* Left Side: Form */}
                        <div className="auth-form-container">
                            <div className="auth-box show">
                                {/* Hospital Branding */}
                                <div className="hospital-brand">
                                    {hospital?.logo ? (
                                        <img src={hospital.logo} alt={hospital.name} className="hospital-logo" />
                                    ) : (
                                        <div className="hospital-logo-placeholder"><RiHospitalLine /></div>
                                    )}
                                    <div className="hospital-brand-text">
                                        <h2>{hospital?.name}</h2>
                                        <p>{hospital?.city ? `${hospital.city} • ` : ''}Staff Portal</p>
                                    </div>
                                </div>

                                <div className="auth-header">
                                    <h3>Welcome Back</h3>
                                    <p>Sign in with your hospital-issued credentials.</p>
                                </div>

                                {error && (
                                    <motion.div 
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        className="error-message"
                                    >
                                        {error}
                                    </motion.div>
                                )}

                                <form onSubmit={handleSubmit} className="modern-form">
                                    <div className="auth-input-group">
                                        <label>Email Address</label>
                                        <div className="input-field-wrapper">
                                            <HiOutlineMail className="input-icon" />
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
                                    <div className="auth-input-group">
                                        <label>Password</label>
                                        <div className="input-field-wrapper">
                                            <HiOutlineLockClosed className="input-icon" />
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
                                    
                                    <div className="form-options">
                                        <label className="checkbox-label">
                                            <input type="checkbox" />
                                            <span>Remember me</span>
                                        </label>
                                        <a href="#" className="forgot-link">Forgot password?</a>
                                    </div>

                                    <button className="btn-primary btn-block" type="submit" disabled={loading}>
                                        {loading ? <span className="loader-dots">Authenticating...</span> : 'Sign In to Portal'}
                                    </button>
                                </form>

                                <div className="auth-footer-note" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                    <img src="https://www.medical365.in/logo/medical365fav.jpg" alt="Medical 365" style={{ height: '18px', objectFit: 'contain' }} />
                                    <span>Safe & Secure Industrial-Grade Clinical System</span>
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Visual */}
                        <div className="auth-visual">
                            <img
                                src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=1000&auto=format&fit=crop"
                                alt="Modern Healthcare"
                                className="auth-hero-img"
                            />
                            <div className="auth-visual-overlay"></div>
                            <div className="auth-content show">
                                <div className="visual-badge">Secure Access</div>
                                <h2>Isolated <br /> Medical Ecosystem.</h2>
                                <p>
                                    Your data resides in a dedicated instance for {hospital?.name}.
                                    Powered by Medical 365 Enterprise Security.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        </section>
    );
};

export default HospitalLogin;
