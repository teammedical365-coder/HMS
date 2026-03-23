import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { loginAdmin, clearError } from '../../store/slices/authSlice';
import '../user/Login.css';

const CentralAdminLogin = () => {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { loading, error, isAuthenticated, user } = useAuth();

    const [formData, setFormData] = useState({ email: '', password: '' });

    useEffect(() => {
        dispatch(clearError());
    }, [dispatch]);

    useEffect(() => {
        if (isAuthenticated && user) {
            const role = user.role?.toLowerCase();
            if (role === 'centraladmin' || role === 'superadmin') {
                navigate('/supremeadmin');
            }
        }
    }, [isAuthenticated, user, navigate]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        dispatch(clearError());
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        dispatch(clearError());
        if (!formData.email || !formData.password) return;
        await dispatch(loginAdmin({ email: formData.email, password: formData.password }));
    };

    return (
        <section className="auth-section">
            <div className="auth-blob blob-1" />
            <div className="auth-blob blob-2" />

            <div className="auth-card">
                {/* Left: Form */}
                <div className="auth-form-container">
                    <div className="auth-box">
                        <button onClick={() => navigate('/')} className="back-button" type="button" style={{ marginBottom: '24px', position: 'static' }}>
                            <span className="back-icon">←</span> Go Back
                        </button>

                        <div className="auth-brand">
                            <div className="auth-brand-icon">🏛️</div>
                            <span className="auth-brand-name">Central Admin Login</span>
                        </div>

                        <h2>System Access</h2>
                        <p>Sign in to the Supreme Administration Portal.</p>

                        {error && (
                            <div className="error-message">⚠️ {error}</div>
                        )}

                        <form onSubmit={handleSubmit}>
                            <div className="input-group">
                                <label>Email Address</label>
                                <div className="input-wrapper">
                                    <input
                                        type="email" name="email"
                                        placeholder="system@admin.com"
                                        value={formData.email} onChange={handleChange} required
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label>Password</label>
                                <div className="input-wrapper">
                                    <input
                                        type="password" name="password"
                                        placeholder="Enter your password"
                                        value={formData.password} onChange={handleChange} required
                                    />
                                </div>
                            </div>

                            <button className="btn-primary btn-block" disabled={loading} style={{ marginTop: '24px' }}>
                                {loading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                        <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                                        Authenticating...
                                    </span>
                                ) : 'Secure Login →'}
                            </button>
                        </form>

                        <div className="divider"><span>options</span></div>

                        <p className="switch-text" style={{ textAlign: 'center' }}>
                            <Link to="/supremeadmin/signup" className="switch-link">Create Central Admin</Link>
                            <br/><br/>
                            <Link to="/hospitaladmin/login" className="switch-link">Hospital Admin?</Link>
                            {' | '}
                            <Link to="/login" className="switch-link">Regular User?</Link>
                        </p>
                    </div>
                </div>

                {/* Right: Visual */}
                <div className="auth-visual">
                    <img
                        src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1000&auto=format&fit=crop"
                        alt="Central Admin"
                    />
                    <div className="auth-features">
                        <div className="auth-feature-chip">🌍 Multi-Tenant Control</div>
                        <div className="auth-feature-chip">🎨 White-labeling</div>
                        <div className="auth-feature-chip">🔒 System Security</div>
                    </div>
                    <div className="auth-content">
                        <h2>Supreme Control <br /> Center.</h2>
                        <p>Oversee all registered hospitals, manage client databases, and configure software branding from one secure portal.</p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default CentralAdminLogin;
