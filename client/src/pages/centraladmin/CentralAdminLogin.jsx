import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { loginAdmin, clearError } from '../../store/slices/authSlice';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineMail, HiOutlineLockClosed } from 'react-icons/hi';
import { RiArrowLeftLine } from 'react-icons/ri';
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
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="auth-container"
                >
                    <div className="auth-blob blob-1" />
                    <div className="auth-blob blob-2" />

                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="auth-card"
                    >
                        {/* Left: Form */}
                        <div className="auth-form-container">
                            <div className="auth-box">
                                <button onClick={() => navigate('/')} className="back-button-new" type="button">
                                    <RiArrowLeftLine /> <span>Go Back</span>
                                </button>

                                <div className="hospital-brand">
                                    <img src="logo.png" alt="Medical 365" style={{ height: '40px', objectFit: 'contain' }} />
                                </div>

                                <div className="auth-header">
                                    <h3>Supreme Portal</h3>
                                    <p>Sign in to the system administration dashboard.</p>
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
                                        <label>Admin Email</label>
                                        <div className="input-field-wrapper">
                                            <HiOutlineMail className="input-icon" />
                                            <input
                                                type="email"
                                                name="email"
                                                placeholder="admin@medical365.com"
                                                value={formData.email}
                                                onChange={handleChange}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="auth-input-group">
                                        <label>Secret Password</label>
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

                                    <button className="btn-primary btn-block" disabled={loading} style={{ marginTop: '1rem' }}>
                                        {loading ? <span className="loader-dots">Authenticating...</span> : 'Access System Control →'}
                                    </button>
                                </form>

                                <div className="auth-footer-note">
                                    Enterprise Internal Control Node
                                </div>
                            </div>
                        </div>

                        {/* Right: Visual */}
                        <div className="auth-visual" style={{ background: '#020617' }}>
                            <img
                                src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1000&auto=format&fit=crop"
                                alt="Central Control"
                                className="auth-hero-img"
                                style={{ opacity: 0.3 }}
                            />
                            <div className="auth-visual-overlay"></div>
                            <div className="auth-content">
                                <div className="visual-badge" style={{ color: '#6366f1', background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.3)' }}>
                                    System Core
                                </div>
                                <h2>Global Oversight.</h2>
                                <p>Manage all clinical instances, audit logs, and provider performance from the unified central command.</p>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        </section>
    );
};

export default CentralAdminLogin;
