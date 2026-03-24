import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { loginUser, clearError } from '../../store/slices/authSlice';
import { useBranding } from '../../context/BrandingContext';
import { getSubdomain } from '../../utils/subdomain';
import api from '../../utils/api';
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
            {/* Decorative Blobs */}
            <div className="auth-blob blob-1"></div>
            <div className="auth-blob blob-2"></div>

            <div className="auth-card">
                {/* Left Side: Form */}
                <div className="auth-form-container">
                    <div className="auth-box show">
                        {/* Hospital Branding */}
                        <div className="hospital-brand">
                            {hospital?.logo ? (
                                <img src={hospital.logo} alt={hospital.name} className="hospital-logo" />
                            ) : (
                                <div className="hospital-logo-placeholder">🏥</div>
                            )}
                            <div>
                                <h2 style={{ marginBottom: '2px' }}>{hospital?.name}</h2>
                                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
                                    {hospital?.city ? `${hospital.city} • ` : ''}Staff Portal
                                </p>
                            </div>
                        </div>

                        <p style={{ color: '#666', marginBottom: '24px', fontSize: '0.9rem' }}>
                            Sign in with your hospital-issued credentials.
                        </p>

                        {error && <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div>}

                        <form onSubmit={handleSubmit}>
                            <div className="input-group">
                                <label>Email Address</label>
                                <div className="input-wrapper">
                                    <i className="fa-regular fa-envelope"></i>
                                    <input
                                        type="email" name="email"
                                        placeholder="staff@hospital.com"
                                        value={formData.email}
                                        onChange={handleChange} required
                                    />
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Password</label>
                                <div className="input-wrapper">
                                    <i className="fa-solid fa-lock"></i>
                                    <input
                                        type="password" name="password"
                                        placeholder="••••••••"
                                        value={formData.password}
                                        onChange={handleChange} required
                                    />
                                </div>
                            </div>
                            <button className="btn-primary btn-block" type="submit" disabled={loading}>
                                {loading ? 'Signing In...' : 'Sign In to Portal'}
                            </button>
                        </form>

                        <p style={{ marginTop: '20px', fontSize: '0.82rem', color: '#94a3b8', textAlign: 'center' }}>
                            Hospital Admin?{' '}
                            <a href="/hospitaladmin/login" style={{ color: 'var(--brand-pink)' }}>Admin Login</a>
                            {' '}·{' '}
                            <a href="/supremeadmin/login" style={{ color: '#6c63ff' }}>Central Admin</a>
                        </p>
                    </div>
                </div>

                {/* Right Side: Visual */}
                <div className="auth-visual">
                    <img
                        src="https://images.unsplash.com/photo-1538108149393-ceefbce54471?q=80&w=1000&auto=format&fit=crop"
                        alt="Hospital"
                    />
                    <div className="auth-content auth-box show">
                        <h2>Dedicated Portal <br /> for {hospital?.name}.</h2>
                        <p>
                            All your patient records, appointments, and workflows are isolated
                            and secure within your hospital's private system.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HospitalLogin;
