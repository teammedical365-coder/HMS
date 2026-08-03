import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppDispatch, useAuth } from '../../store/hooks';
import { sendOtp, verifyOtp, resendOtp, forceLogin, clearError, resetOtpFlow } from '../../store/slices/authSlice';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineMail, HiOutlineLockClosed } from 'react-icons/hi';
import { RiArrowLeftLine } from 'react-icons/ri';
import '../user/Login.css';
import PasswordInput from '../../components/PasswordInput';
import OtpVerification from '../../components/OtpVerification';
import ActiveSessionModal from '../../components/ActiveSessionModal';

const CentralAdminLogin = () => {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { loading, error, isAuthenticated, user, otpStep, preAuthToken, otpEmail, activeSession, otpSuccessMsg } = useAuth();

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [sessionBanner, setSessionBanner] = useState(null);

    // Check for session expired message
    useEffect(() => {
        const msg = sessionStorage.getItem('sessionExpiredMessage');
        if (msg) {
            setSessionBanner(msg);
            sessionStorage.removeItem('sessionExpiredMessage');
        }
    }, []);

    useEffect(() => {
        dispatch(clearError());
        dispatch(resetOtpFlow());
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
        setSessionBanner(null);

        // Use OTP flow instead of direct admin login
        await dispatch(sendOtp({
            email: formData.email,
            password: formData.password,
            loginType: 'admin',
        }));
    };

    const handleVerifyOtp = async (otp) => {
        await dispatch(verifyOtp({ preAuthToken, otp }));
    };

    const handleResendOtp = async () => {
        await dispatch(resendOtp({ preAuthToken }));
    };

    const handleBackToLogin = () => {
        dispatch(resetOtpFlow());
    };

    const handleForceLogin = async () => {
        await dispatch(forceLogin({ preAuthToken }));
    };

    const handleCancelSession = () => {
        dispatch(resetOtpFlow());
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
                                {!otpStep && (
                                    <button onClick={() => navigate('/')} className="back-button-new" type="button">
                                        <RiArrowLeftLine /> <span>Go Back</span>
                                    </button>
                                )}

                                <div className="hospital-brand">
                                    <img src="logo.png" alt="Medical 365" style={{ height: '40px', objectFit: 'contain' }} />
                                </div>

                                {/* Session Expired Banner */}
                                {sessionBanner && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        style={{
                                            background: '#fef3c7',
                                            border: '1px solid #fbbf24',
                                            borderRadius: '12px',
                                            padding: '0.85rem 1rem',
                                            marginBottom: '1.25rem',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            color: '#92400e',
                                        }}
                                    >
                                        ⚠️ {sessionBanner}
                                    </motion.div>
                                )}

                                <AnimatePresence mode="wait">
                                    {/* ── Step 1: Credentials ── */}
                                    {!otpStep && (
                                        <motion.div
                                            key="credentials"
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                        >
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
                                                        <PasswordInput
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
                                        </motion.div>
                                    )}

                                    {/* ── Step 2: OTP Verification ── */}
                                    {otpStep === 'otp' && (
                                        <OtpVerification
                                            key="otp"
                                            email={otpEmail}
                                            onVerify={handleVerifyOtp}
                                            onResend={handleResendOtp}
                                            onBack={handleBackToLogin}
                                            loading={loading}
                                            error={error}
                                            successMsg={otpSuccessMsg}
                                        />
                                    )}
                                </AnimatePresence>

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

            {/* Active Session Modal */}
            {otpStep === 'session_check' && activeSession && (
                <ActiveSessionModal
                    activeSession={activeSession}
                    onForceLogin={handleForceLogin}
                    onCancel={handleCancelSession}
                    loading={loading}
                />
            )}
        </section>
    );
};

export default CentralAdminLogin;
