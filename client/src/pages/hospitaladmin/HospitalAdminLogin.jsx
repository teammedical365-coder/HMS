import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { loginHospitalAdmin, clearError } from '../../store/slices/authSlice';
import { motion } from 'framer-motion';
import { RiInformationLine } from 'react-icons/ri';
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
                                <h3>Portal Restriction</h3>
                                <p>Environment-specific access only.</p>
                            </div>

                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', gap: '12px', color: '#0f172a', fontWeight: '700', marginBottom: '8px', alignItems: 'center' }}>
                                    <RiInformationLine style={{ color: '#14b8a6', fontSize: '1.2rem' }} />
                                    Access Protocol
                                </div>
                                <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', lineHeight: '1.6' }}>
                                    For strict environment segregation, administrators <strong>MUST</strong> log in through their dedicated clinic instance URL.
                                </p>
                            </div>

                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem', color: '#64748b' }}>
                                <div style={{ fontSize: '0.82rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700' }}>Protocol Example:</div>
                                <code style={{ color: '#0f172a', fontSize: '0.9rem', wordBreak: 'break-all' }}>https://your-hospital.com/<b>hospital-name</b>/login</code>
                            </div>

                            <div className="auth-footer-note" style={{ marginTop: '4rem' }}>
                                Node isolation enforced
                            </div>
                        </div>
                    </div>

                    {/* Right: Visual */}
                    <div className="auth-visual" style={{ background: '#0a192f' }}>
                        <img
                            src="https://images.unsplash.com/photo-1576091160550-217359f4268e?q=80&w=1000&auto=format&fit=crop"
                            alt="Hospital Network"
                            className="auth-hero-img"
                            style={{ opacity: 0.3 }}
                        />
                        <div className="auth-visual-overlay"></div>
                        <div className="auth-content">
                            <div className="visual-badge">Protocol Enabled</div>
                            <h2>Management <br /> Isolation.</h2>
                            <p>
                                Admin dashboards are only accessible via authenticated clinical endpoints to prevent cross-tenant data leaks.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
};

export default HospitalAdminLogin;
