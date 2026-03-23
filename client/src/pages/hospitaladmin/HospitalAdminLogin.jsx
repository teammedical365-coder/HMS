import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { loginHospitalAdmin, clearError } from '../../store/slices/authSlice';
import '../user/Login.css';

const HospitalAdminLogin = () => {
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
            if (role === 'hospitaladmin') {
                navigate('/hospitaladmin');
            } else if (role === 'centraladmin' || role === 'superadmin') {
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
        await dispatch(loginHospitalAdmin({ email: formData.email, password: formData.password }));
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
                            <span className="auth-brand-name">Hospital Admin Login</span>
                        </div>

                        <h2>Access Restricted</h2>
                        <p style={{ color: '#666', fontSize: '0.95rem', lineHeight: '1.5' }}>
                            For enhanced security and strict row-level environment segregation, the generic admin login is deactivated. <br/><br/>
                            <strong>Hospital Administrators MUST log in via their dedicated clinic portal URL.</strong>
                        </p>

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', margin: '24px 0', fontSize: '0.9rem', color: '#475569' }}>
                            <strong>Example:</strong><br />
                            <code>https://your-hospital.com/<b>your-clinic-name</b>/login</code>
                        </div>

                        <p className="switch-text" style={{ textAlign: 'center', marginTop: '30px' }}>
                            <Link to="/supremeadmin/login" className="switch-link">To Supreme Admin Login →</Link>
                        </p>
                    </div>
                </div>

                {/* Right: Visual */}
                <div className="auth-visual">
                    <img
                        src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=1000&auto=format&fit=crop"
                        alt="Hospital Admin"
                    />
                    <div className="auth-features">
                        <div className="auth-feature-chip">📈 Real-time Analytics</div>
                        <div className="auth-feature-chip">👨‍⚕️ Staff Management</div>
                        <div className="auth-feature-chip">⚙️ Configuration</div>
                    </div>
                    <div className="auth-content">
                        <h2>Manage Your <br /> Hospital Seamlessly.</h2>
                        <p>Access your hospital's departments, doctors, and patient analytics in one centralized dashboard.</p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HospitalAdminLogin;
